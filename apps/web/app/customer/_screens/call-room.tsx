'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { themeVar } from '@autoworkshop/design-tokens';
import { StatusBadge } from '@autoworkshop/ui';

/**
 * THE IN-APP CALL — slice 11. Real WebRTC, in this product, no third party.
 *
 * ── HOW THIS WORKS WITHOUT A MEDIA SERVER ──────────────────────────────────
 *
 *   1. both browsers open this component and start polling `/calls/:id/signals`
 *   2. the POLITE/IMPOLITE peer rule (below) decides which one sends the offer
 *   3. SDP and ICE candidates travel through our own API — a handful of small
 *      messages over a few seconds
 *   4. once connected, **audio and video flow browser to browser and never
 *      touch this platform at all**
 *
 * That last point is why this is better than embedding somebody else's meeting
 * room, not merely cheaper: a customer's conversation about their car does not
 * pass through a third party we do not control.
 *
 * ── 🔴 WHICH PEER SENDS THE OFFER: DECIDED, NOT RACED ──────────────────────
 *
 * If both peers create an offer at once, both reject the other's and the call
 * never connects — the classic WebRTC glare bug, and it is intermittent, which
 * makes it the worst kind to debug. The rule here is deterministic and needs no
 * coordination: **the participant whose user id sorts LOWER is the caller.**
 * Both browsers compute the same answer from data they already have.
 *
 * ── 🔴 A FAILED CONNECTION IS REPORTED, NEVER SPUN ON ──────────────────────
 *
 * Behind symmetric NAT or a locked-down firewall the peers cannot find a path.
 * This platform has no TURN relay to fall back on, because the hosting tier
 * cannot run one. So `iceConnectionState === 'failed'` posts a
 * `connection_failed` event and the screen SAYS the media could not connect and
 * offers the phone. A spinner that never resolves would be a defect; a stated
 * limitation is not.
 *
 * ── ⚠️ THE CAMERA IS NEVER TOUCHED FOR A VOICE CALL ────────────────────────
 *
 * `medium === 'voice'` requests audio only. Asking for video and not rendering
 * it would light the camera indicator on somebody's laptop during what they
 * were told was a phone call.
 */

interface Signal {
  seq: string;
  fromUserId: string;
  signalKind: string;
  payload: Record<string, unknown>;
}

type Phase =
  | 'idle'
  | 'requesting_media'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'ended'
  | 'no_media';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Not started',
  requesting_media: 'Asking for your microphone',
  connecting: 'Connecting',
  connected: 'Connected',
  failed: 'Could not connect',
  ended: 'Call ended',
  no_media: 'No microphone or camera',
};

const PHASE_TONE: Record<Phase, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  idle: 'draft',
  requesting_media: 'attention',
  connecting: 'attention',
  connected: 'complete',
  failed: 'blocked',
  ended: 'draft',
  no_media: 'blocked',
};

export function CallRoom({
  callId,
  medium,
  myUserId,
  peerUserIds,
  apiBase,
}: {
  callId: string;
  /** 'voice' or 'video'. Anything else means this call is not carried in-app. */
  medium: string;
  myUserId: string;
  peerUserIds: string[];
  /** The workspace API proxy this app already uses for authenticated calls. */
  apiBase: string;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [detail, setDetail] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
  const cursor = useRef<string>('0');
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards the "have I already answered?" question across async polls, which
  // React state cannot do — a state read inside an interval closure is stale.
  const negotiating = useRef(false);

  const wantsVideo = medium === 'video';

  // 🔴 DETERMINISTIC, NOT RACED. Both browsers compute the same answer.
  const peer = peerUserIds[0] ?? '';
  const iAmCaller = peer !== '' && myUserId < peer;

  const post = useCallback(
    async (path: string, body: unknown) => {
      const res = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.ok;
    },
    [apiBase],
  );

  const reportFailure = useCallback(
    async (note: string) => {
      setPhase('failed');
      setDetail(note);
      // Recorded on the call, so "why did this not work?" is answerable
      // afterwards — and so the frequency of this becomes the measurement that
      // would justify a relay later.
      await post(`/calls/${callId}/events`, { eventKind: 'connection_failed', note });
    },
    [callId, post],
  );

  const teardown = useCallback(() => {
    if (polling.current) clearInterval(polling.current);
    polling.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    pc.current?.close();
    pc.current = null;
  }, []);

  // Stop the camera and microphone when this component goes away, whatever the
  // reason. A hardware light left on after navigating away is the kind of thing
  // people never trust again.
  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    if (!peer) {
      setPhase('failed');
      setDetail('Nobody else is on this call yet.');
      return;
    }

    setPhase('requesting_media');
    setDetail(null);

    let stream: MediaStream;
    try {
      // Audio only for a voice call — see the header. Asking for video would
      // light the camera indicator during what was announced as a phone call.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantsVideo ? { width: { ideal: 1280 } } : false,
      });
    } catch (err) {
      setPhase('no_media');
      setDetail(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Your browser blocked access to the microphone. Allow it in the address bar and try again, or ring the customer instead.'
          : 'No microphone or camera is available on this device. You can still ring the customer and record the outcome here.',
      );
      return;
    }
    localStream.current = stream;
    if (localVideo.current) localVideo.current.srcObject = stream;

    const iceRes = await fetch(`${apiBase}/calls/ice-servers`);
    const { iceServers } = iceRes.ok
      ? ((await iceRes.json()) as { iceServers: RTCIceServer[] })
      : { iceServers: [] };

    const connection = new RTCPeerConnection({ iceServers });
    pc.current = connection;
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));

    connection.ontrack = (event) => {
      if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0] ?? null;
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        void post(`/calls/${callId}/signals`, {
          signalKind: 'ice',
          payload: event.candidate.toJSON() as unknown as Record<string, unknown>,
          toUserId: peer,
        });
      }
    };

    connection.oniceconnectionstatechange = () => {
      const state = connection.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        setPhase('connected');
        setDetail(null);
        void post(`/calls/${callId}/events`, { eventKind: 'connected' });
      }
      if (state === 'failed') {
        void reportFailure(
          'The two devices could not find a direct route to each other. This usually means one of you is on a restricted network.',
        );
      }
    };

    await post(`/calls/${callId}/join`, {});
    setPhase('connecting');

    if (iAmCaller) {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await post(`/calls/${callId}/signals`, {
        signalKind: 'offer',
        payload: { type: offer.type, sdp: offer.sdp },
        toUserId: peer,
      });
    }

    polling.current = setInterval(async () => {
      const res = await fetch(`${apiBase}/calls/${callId}/signals?after=${cursor.current}`);
      if (!res.ok) return;
      const signals = (await res.json()) as Signal[];
      for (const signal of signals) {
        cursor.current = signal.seq;
        const conn = pc.current;
        if (!conn) return;

        try {
          if (signal.signalKind === 'offer' && !negotiating.current) {
            negotiating.current = true;
            await conn.setRemoteDescription(
              new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit),
            );
            const answer = await conn.createAnswer();
            await conn.setLocalDescription(answer);
            await post(`/calls/${callId}/signals`, {
              signalKind: 'answer',
              payload: { type: answer.type, sdp: answer.sdp },
              toUserId: signal.fromUserId,
            });
          } else if (signal.signalKind === 'answer') {
            // Only meaningful while we are still offering. Applying an answer
            // in any other state throws and kills the connection.
            if (conn.signalingState === 'have-local-offer') {
              await conn.setRemoteDescription(
                new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit),
              );
            }
          } else if (signal.signalKind === 'ice') {
            // ⚠️ A candidate arriving before the remote description is normal,
            // not an error. Swallowing it here is correct; letting it throw
            // would abort a call that was about to connect.
            try {
              await conn.addIceCandidate(signal.payload as unknown as RTCIceCandidateInit);
            } catch {
              /* candidate arrived early or is not applicable — ignore */
            }
          } else if (signal.signalKind === 'bye') {
            teardown();
            setPhase('ended');
          }
        } catch (err) {
          await reportFailure(
            `The call could not be negotiated: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }, 1000);
  }, [apiBase, callId, iAmCaller, peer, post, reportFailure, teardown, wantsVideo]);

  const hangUp = useCallback(async () => {
    await post(`/calls/${callId}/signals`, { signalKind: 'bye', payload: {}, toUserId: peer });
    await post(`/calls/${callId}/events`, { eventKind: 'left' });
    teardown();
    setPhase('ended');
  }, [callId, peer, post, teardown]);

  function toggleMute() {
    const next = !muted;
    localStream.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  function toggleCamera() {
    const next = !cameraOff;
    localStream.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCameraOff(next);
  }

  const button: React.CSSProperties = {
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    padding: '0.5rem 0.875rem',
    borderRadius: '0.375rem',
    border: `1px solid ${themeVar.borderDefault}`,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
  };

  return (
    <section
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: '0.75rem',
        background: themeVar.surfaceRaised,
        padding: '1rem',
        margin: '1rem 0',
      }}
    >
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* The state is text, never a colour alone (§66). */}
        <StatusBadge kind={PHASE_TONE[phase]} label={PHASE_LABEL[phase]} />
        {phase === 'idle' ? (
          <button type="button" style={button} onClick={() => void start()}>
            {wantsVideo ? 'Start video call' : 'Start voice call'}
          </button>
        ) : null}
        {phase === 'connecting' || phase === 'connected' ? (
          <>
            <button type="button" style={button} onClick={toggleMute}>
              {muted ? 'Unmute' : 'Mute'}
            </button>
            {wantsVideo ? (
              <button type="button" style={button} onClick={toggleCamera}>
                {cameraOff ? 'Camera on' : 'Camera off'}
              </button>
            ) : null}
            <button type="button" style={button} onClick={() => void hangUp()}>
              Hang up
            </button>
          </>
        ) : null}
        {phase === 'failed' || phase === 'no_media' ? (
          <button type="button" style={button} onClick={() => void start()}>
            Try again
          </button>
        ) : null}
      </div>

      {detail ? (
        <p role="alert" style={{ margin: '0.75rem 0 0', maxWidth: '60ch' }}>
          {detail}
          {phase === 'failed' ? (
            <>
              {' '}
              Ring them instead and record what was agreed below — the outcome is
              the part that matters, and it is kept either way.
            </>
          ) : null}
        </p>
      ) : null}

      {wantsVideo ? (
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <video
            ref={remoteVideo as React.RefObject<HTMLVideoElement>}
            autoPlay
            playsInline
            style={{ width: '100%', maxWidth: 480, borderRadius: '0.5rem', background: '#000' }}
          />
          <video
            ref={localVideo}
            autoPlay
            playsInline
            // Muted, always: playing your own microphone back is instant
            // feedback howl.
            muted
            style={{ width: 160, borderRadius: '0.5rem', background: '#000' }}
          />
        </div>
      ) : (
        // A voice call still needs an element to attach the remote stream to.
        <audio ref={remoteVideo as React.RefObject<HTMLAudioElement>} autoPlay />
      )}

      <p style={{ margin: '0.75rem 0 0', fontSize: '0.8125rem', color: themeVar.textSecondary, maxWidth: '60ch' }}>
        The audio and video go straight between the two devices — they are not
        recorded and do not pass through this platform.
      </p>
    </section>
  );
}
