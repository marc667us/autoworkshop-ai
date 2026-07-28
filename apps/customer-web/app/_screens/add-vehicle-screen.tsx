import { apiGet, describeApiFailure } from '@autoworkshop/next-shell';
import {
  PageHeader,
  ErrorState,
  EmptyState,
  Field,
  FormShell,
  Select,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { addVehicleAction } from './add-vehicle-actions';

/**
 * Add Vehicle — `01 (1).txt` §33, and `2.txt` §537: "A vehicle owner should be
 * able to register one or more vehicles by entering or scanning the
 * registration number, vehicle identification number, make, model, year, engine
 * type, transmission type, fuel type, mileage and insurance information."
 *
 * ⚠️ NO OWNER PICKER, DELIBERATELY. The workshop's version of this form lets
 * reception choose a customer. A customer may only register vehicles to
 * THEMSELVES, so the owner is resolved rather than chosen: `GET /customers`
 * already returns exactly one row for a `customer` viewer — their own — because
 * `CustomerService` narrows on `user_id`. That single row supplies the id.
 *
 * Sending it in a hidden field looks like trusting the client, and would be if
 * anything depended on it. `VehicleService.create` re-checks the parent with
 * `user_id = ctx.userId` for this role, so a tampered value returns "customer
 * not found" — the field is a convenience, not a credential (CLAUDE.md §8).
 */

export const dynamic = 'force-dynamic';

interface MyCustomer {
  id: string;
  displayName: string;
}
interface MakeOption {
  id: string;
  name: string;
}

export async function AddVehicleScreen() {
  const [me, makes] = await Promise.all([
    apiGet<MyCustomer[]>('customer', '/customers'),
    apiGet<MakeOption[]>('customer', '/vehicle-makes'),
  ]);

  const header = (
    <PageHeader
      title="Add Vehicle"
      description="Register a vehicle to your account. Registration number and make are required; everything else can follow."
    />
  );

  if (!me.ok || !makes.ok) {
    const failed = !me.ok ? me : (makes as Extract<typeof makes, { ok: false }>);
    const { title, description } = describeApiFailure(failed.reason);
    return (
      <>
        {header}
        <ErrorState title={title} message={description} />
      </>
    );
  }

  // A customer with no customer record cannot own a vehicle — `customer_id` is
  // NOT NULL. That is a real state, not an edge case: an account can exist
  // before any workshop has booked them in. Rendering a form that could only
  // fail would be worse than saying so.
  const mine = me.data[0];
  if (!mine) {
    return (
      <>
        {header}
        <EmptyState
          title="Your account is not linked to a customer profile yet"
          description="A workshop creates that profile when you first book a vehicle in. Once it exists, you can add vehicles here yourself."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <FormShell
        action={addVehicleAction}
        successPrefix="Added"
        successHref={{ href: '/my-vehicles/garage', label: 'View your garage' }}
      >
        {/* Resolved, not chosen — and re-checked server-side against the
            session, so tampering with it fails rather than reassigns. */}
        <input type="hidden" name="customerId" value={mine.id} />

        <Field
          label="Registration number"
          hint="As shown on your number plate."
          htmlFor="registrationNumber"
        >
          <TextInput
            id="registrationNumber"
            name="registrationNumber"
            required
            autoComplete="off"
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
          />
        </Field>

        <Field label="Make" htmlFor="makeId">
          <Select
            id="makeId"
            name="makeId"
            required
            options={makes.data.map((m) => ({ value: m.id, label: m.name }))}
          />
        </Field>

        <Field label="Model / variant" hint="For example Hilux 2.4 GD-6." htmlFor="variant">
          <TextInput id="variant" name="variant" autoComplete="off" />
        </Field>

        <Field label="Year" htmlFor="modelYear">
          <TextInput id="modelYear" name="modelYear" type="number" min={1900} max={2100} />
        </Field>

        <Field label="VIN" hint="Chassis number, if you have it to hand." htmlFor="vin">
          <TextInput
            id="vin"
            name="vin"
            autoComplete="off"
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
          />
        </Field>

        <Field
          label="Engine"
          hint="Engine code or size, if you know it — for example 2KD-FTV or 2.4L."
          htmlFor="engineType"
        >
          <TextInput id="engineType" name="engineType" autoComplete="off" />
        </Field>

        <Field label="Fuel" htmlFor="fuelType">
          <Select
            id="fuelType"
            name="fuelType"
            defaultValue=""
            options={[
              // "Not sure" rather than a forced guess: this form is filled in by
              // the vehicle's owner, not by a technician, and a wrong fuel type
              // recorded confidently is worse than an absent one.
              { value: '', label: 'Not sure' },
              { value: 'petrol', label: 'Petrol' },
              { value: 'diesel', label: 'Diesel' },
              { value: 'hybrid', label: 'Hybrid' },
              { value: 'electric', label: 'Electric' },
              { value: 'lpg', label: 'LPG' },
              { value: 'cng', label: 'CNG' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </Field>

        <Field label="Transmission" htmlFor="transmissionType">
          <Select
            id="transmissionType"
            name="transmissionType"
            defaultValue=""
            options={[
              { value: '', label: 'Not sure' },
              { value: 'manual', label: 'Manual' },
              { value: 'automatic', label: 'Automatic' },
              { value: 'cvt', label: 'CVT' },
              { value: 'dual_clutch', label: 'Dual clutch' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </Field>

        <Field
          label="Mileage (km)"
          hint="Roughly what the odometer reads today."
          htmlFor="currentMileageKm"
        >
          <TextInput id="currentMileageKm" name="currentMileageKm" type="number" min={0} />
        </Field>

        <Field label="Colour" htmlFor="colour">
          <TextInput id="colour" name="colour" autoComplete="off" />
        </Field>

        <Field label="Insurer" hint="Who the vehicle is insured with." htmlFor="insurerName">
          <TextInput id="insurerName" name="insurerName" autoComplete="off" />
        </Field>

        <Field label="Policy number" htmlFor="insurancePolicyNo">
          <TextInput id="insurancePolicyNo" name="insurancePolicyNo" autoComplete="off" />
        </Field>

        <Field label="Insurance expires" htmlFor="insuranceExpiresOn">
          <TextInput id="insuranceExpiresOn" name="insuranceExpiresOn" type="date" />
        </Field>

        <SubmitButton>Add vehicle</SubmitButton>
      </FormShell>
    </>
  );
}
