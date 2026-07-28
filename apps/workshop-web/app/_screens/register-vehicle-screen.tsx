import { apiGet, describeApiFailure } from '@autoworkshop/next-shell';
import { PageHeader, ErrorState, EmptyState } from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { registerVehicleAction } from './register-actions';
import { Field, FormShell, Select, SubmitButton, TextInput } from './form-controls';

/**
 * Register a vehicle — `2.txt` §537.
 *
 * "…entering or scanning the registration number, vehicle identification
 * number, make, model, year, engine type, transmission type, fuel type,
 * mileage and insurance information."
 *
 * THE PICKERS ARE WHY THIS SCREEN IS THE PROOF OF THE SCHEMA RULE. The owner is
 * chosen from the real customer list and the make from the real taxonomy, so the
 * form submits `customerId` and `makeId` — foreign keys — not typed-in names.
 * That is what stops "Toyota", "TOYOTA" and "toyata" becoming three
 * manufacturers, and it is why the vehicle list can join instead of guess.
 *
 * Both lists are loaded SERVER-SIDE before the form renders, which also means
 * the customer picker is already tenant- and organization-scoped by
 * `CustomerService` — a user cannot be offered an owner they may not see.
 */

interface CustomerOption {
  id: string;
  displayName: string;
}
interface MakeOption {
  id: string;
  name: string;
}

export async function RegisterVehicleScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Register Vehicle');

  // Loaded together — neither depends on the other, so serialising them would
  // just make the page slower.
  const [customers, makes] = await Promise.all([
    apiGet<CustomerOption[]>('workshop', '/customers'),
    apiGet<MakeOption[]>('workshop', '/vehicle-makes'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="Register a vehicle against an existing customer. Registration number, owner and make are required."
    />
  );

  if (!customers.ok || !makes.ok) {
    const { title: t, message } = (() => {
      const failed = !customers.ok ? customers : (makes as Extract<typeof makes, { ok: false }>);
      const d = describeApiFailure(failed.reason);
      return { title: d.title, message: d.description };
    })();
    return (
      <>
        {header}
        <ErrorState title={t} message={message} />
      </>
    );
  }

  // A vehicle cannot exist without an owner — `customer_id` is NOT NULL — so an
  // empty customer list is a dead end, not an empty dropdown. Saying so, and
  // pointing at the fix, beats rendering a form that cannot be submitted.
  if (customers.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Register a customer first"
          description="Every vehicle belongs to a customer, so there is nobody to register this vehicle to yet. Add the customer, then come back."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <FormShell
        action={registerVehicleAction}
        successPrefix="Registered"
        successHref={{ href: '/vehicles/vehicle-search', label: 'View the vehicle list' }}
      >
        <Field
          label="Registration number"
          hint="As shown on the number plate. Must be unique within this organisation."
          htmlFor="registrationNumber"
        >
          <TextInput
            id="registrationNumber"
            name="registrationNumber"
            required
            autoComplete="off"
            // Monospaced for the same reason the list uses it: a plate is read
            // character by character, and 0/O and 1/I are ambiguous otherwise
            // (`01 (1).txt` §2845).
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
          />
        </Field>

        <Field
          label="Owner"
          hint="The customer this vehicle belongs to. Only customers of this organisation are listed."
          htmlFor="customerId"
        >
          <Select
            id="customerId"
            name="customerId"
            required
            options={customers.data.map((c) => ({ value: c.id, label: c.displayName }))}
          />
        </Field>

        <Field
          label="Make"
          hint="Not in the list? It can be added — ask an administrator."
          htmlFor="makeId"
        >
          <Select
            id="makeId"
            name="makeId"
            required
            options={makes.data.map((m) => ({ value: m.id, label: m.name }))}
          />
        </Field>

        <Field label="Model / variant" hint="For example ‘Hilux 2.4 GD-6’." htmlFor="variant">
          <TextInput id="variant" name="variant" autoComplete="off" />
        </Field>

        <Field label="Year" htmlFor="modelYear">
          <TextInput id="modelYear" name="modelYear" type="number" min={1900} max={2100} />
        </Field>

        <Field
          label="VIN"
          hint="Chassis number. Optional, and unique within this organisation when given."
          htmlFor="vin"
        >
          <TextInput
            id="vin"
            name="vin"
            autoComplete="off"
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
          />
        </Field>

        <Field label="Fuel" htmlFor="fuelType">
          <Select
            id="fuelType"
            name="fuelType"
            defaultValue=""
            options={[
              { value: '', label: 'Not recorded' },
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
              { value: '', label: 'Not recorded' },
              { value: 'manual', label: 'Manual' },
              { value: 'automatic', label: 'Automatic' },
              { value: 'cvt', label: 'CVT' },
              { value: 'dual_clutch', label: 'Dual clutch' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </Field>

        <Field label="Mileage (km)" hint="The odometer reading at intake." htmlFor="currentMileageKm">
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

        <SubmitButton>Register vehicle</SubmitButton>
      </FormShell>
    </>
  );
}
