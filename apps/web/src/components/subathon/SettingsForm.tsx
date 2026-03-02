import { Form } from "#/ui/Form";
import { NumberField } from "#/ui/NumberField";
import dayjs from "dayjs";
import type { UpdateSubathonSettings } from "@subathon-goal-tracker/messages/schema";
import { useEffect, useRef, type ComponentProps, type PropsWithoutRef } from "react";
import { Controller, useForm, type Control, type FieldValues, type Path } from "react-hook-form";
import { Button } from "#/ui/Button";

type SubathonSettings = Omit<UpdateSubathonSettings, 'type'>;
type Inputs = {
  maxAdditionalHours: number;
  tier1Seconds: number;
  tier2Seconds: number;
  tier3Seconds: number;
  bitsStep: number;
  bitsStepSecond: number;
//   targetPointsPerSub: number;
//   targetPointsPerBitStep: number;
};

export function GeneralSettingsForm(props: { onSubmit: (values: SubathonSettings) => void; value: SubathonSettings; isSubathonStarted: boolean }) {
  const { onSubmit, value, isSubathonStarted } = props;

  const h2s = (hours: number) => Math.floor(dayjs.duration(hours, "hours").asSeconds());
  const maxAdditionalHours = value.maxAdditionalSeconds / (60 * 60);

  const { handleSubmit, control, reset, formState } = useForm<Inputs>({
    values: {
      ...value.incrementValues,
      maxAdditionalHours: maxAdditionalHours,
    //   targetPointsPerSub: 1,
    //   targetPointsPerBitStep: 0,
    },
    resetOptions: {
      keepDefaultValues: true
    },
    disabled: isSubathonStarted
  });

  const onFormSubmit = (inputs: Inputs) => {
    onSubmit({
      goals: value.goals,
      incrementValues: {
        tier1Seconds: inputs.tier1Seconds,
        tier2Seconds: inputs.tier2Seconds,
        tier3Seconds: inputs.tier3Seconds,
        bitsStep: inputs.bitsStep,
        bitsStepSecond: inputs.bitsStepSecond,
      },
      maxAdditionalSeconds: h2s(inputs.maxAdditionalHours),
    });
  }

  return (
    <div>
        <h2 className="text-2xl font-semibold">General</h2>
        <Form className="grid grid-cols-2 gap-y-2 gap-x-6" onSubmit={handleSubmit(onFormSubmit)}>
            <div className="col-span-2">Subathon Length</div>
            <SettingsNumberField label="Maximum Additional Hours" name="maxAdditionalHours" control={control} rules={{ required: true, min: 0 }} />
            <div className="col-span-2">Subscription Values</div>
            <SettingsNumberField label="Tier 1 Subs (seconds)" name="tier1Seconds" control={control} rules={{ required: true, min: 1 }} />
            <SettingsNumberField label="Tier 2 Subs (seconds)" name="tier2Seconds" control={control} rules={{ required: true, min: 1 }} />
            <SettingsNumberField label="Tier 3 Subs (seconds)" name="tier3Seconds" control={control} rules={{ required: true, min: 1 }} />
            <div className="col-span-2">Bit Values</div>
            <SettingsNumberField label="Bits Threshold" name="bitsStep" control={control} rules={{ required: true, min: 1 }} />
            <SettingsNumberField label="Seconds per Bit Threshold" name="bitsStepSecond" control={control} rules={{ required: true, min: 1 }} />
            {/* <div className="col-span-2">Goal Addition Values</div>
            <div className="col-span-2 font-light text-sm">The amount of points added towards goals when either a sub or bit threshold counted.</div>
            <SettingsNumberField label="Goal Points per Sub" name="targetPointsPerSub" control={control} rules={{ required: true, min: 1 }} />
            <SettingsNumberField label="Goal Points per Bit Threshold" name="targetPointsPerBitStep" control={control} rules={{ required: true, min: 0 }} /> */}
            <Button type="submit">Submit</Button>
            <Button type="reset" isDisabled={!formState.isDirty} onPress={e => reset()}>Reset</Button>
        </Form>
    </div>
  )
}

function SettingsNumberField<InputType extends FieldValues>({ name, label, control, rules }: { control: Control<InputType>; name: Path<InputType>; label: string; rules?: ComponentProps<typeof Controller>["rules"] }) {
  return (
    <Controller
      control={control}
      name={name}
      rules={{ required: true } }
      render={({ field }) => (
        <NumberField label={label} {...field} onChange={v => field.onChange(v)} />
      )}
     />
  )
}