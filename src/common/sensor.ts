import { assert } from '../utils';
import { Peripheral } from './peripheral';

const MAX_UINT = Math.pow(2, 32) - 1;
const MAX_INT = Math.pow(2, 31) - 1;
const MIN_INT = -Math.pow(2, 31);
const MAX_ULONG = Math.pow(2, 64) - 1;
const MAX_LONG = Math.pow(2, 63) - 1;
const MIN_LONG = -Math.pow(2, 63);

export enum SensorType {
  Temperature = 'temperature',
  Acceleration = 'acceleration',
  AngularRate = 'angular-rate',
  Voltage = 'voltage',
  ECG = 'ecg',
  Humidity = 'humidity',
  Pressure = 'pressure',
  MagneticFluxDensity = 'magnetic-flux-density',
}

export function SensorTypeFromString(value: string): SensorType | undefined {
  return (Object.values(SensorType) as string[]).includes(value)
    ? (value as SensorType)
    : undefined;
}

export function GetSensorValue(type: SensorType, value: any): SensorValue {
  switch (type) {
    case SensorType.Temperature:
      return new TemperatureValue(value);
    case SensorType.Acceleration:
      return new AccelerationValue(value.x, value.y, value.z);
    case SensorType.AngularRate:
      return new AngularRateValue(value.x, value.y, value.z);
    case SensorType.Voltage:
      return new VoltageValue(value);
    case SensorType.ECG:
      return new ECGValue(value);
    case SensorType.Humidity:
      return new HumidityValue(value);
    case SensorType.Pressure:
      return new PressureValue(value);
    case SensorType.MagneticFluxDensity:
      return new MagneticFluxDensityValue(value.x, value.y, value.z);
    default:
      throw Error('Invalid sensor type');
  }
}

export abstract class SensorValue {
  protected constructor(
    private _sample: any,
    validate: boolean = true,
  ) {
    if (validate) {
      this.assertValidate(_sample);
    }
  }

  public get sample(): any {
    return this._sample;
  }

  public abstract get value(): any;

  public abstract get unit(): string;

  public abstract validate(sample: any): boolean;

  protected assertValidate(sample: any) {
    if (!this.validate(sample)) {
      throw Error('Invalid sample value');
    }
  }
}

export class Sensor extends Peripheral {
  public constructor(
    machine: string,
    name: string,
    private _types: SensorType[],
  ) {
    super(machine, name);
  }

  public get types(): SensorType[] {
    return this._types;
  }
}

abstract class SensorScalarValue extends SensorValue {
  protected constructor(
    sample: number,
    protected min: number,
    protected max: number,
    validate: boolean = true,
  ) {
    assert(Number.isInteger(min), 'min is not an integer');
    assert(Number.isInteger(max), 'max is not an integer');
    super(sample, false);
    if (validate) {
      this.assertValidate(sample);
    }
  }

  public abstract get value(): number;

  public validate(sample: number): boolean {
    return Number.isInteger(sample) && this.min <= sample && sample <= this.max;
  }
}

class Sample3D {
  public constructor(
    private x: number,
    private y: number,
    private z: number,
  ) {}

  public get X() {
    return this.x;
  }

  public get Y() {
    return this.y;
  }

  public get Z() {
    return this.z;
  }

  public toTriple(): [number, number, number] {
    return [this.X, this.Y, this.Z];
  }

  public mapValues(f: (v: number) => number): Sample3D {
    return new Sample3D(f(this.X), f(this.Y), f(this.Z));
  }
}

abstract class Sensor32BitTripleValue extends SensorValue {
  protected constructor(sample: Sample3D);
  protected constructor(x: number, y: number, z: number);
  protected constructor(...args: any[]);
  protected constructor(...args: any[]) {
    if (args.length === 1) {
      super(args[0]);
    } else if (args.length === 3) {
      super(new Sample3D(args[0], args[1], args[2]));
    } else {
      throw Error();
    }
  }

  public abstract get value(): Sample3D;

  public abstract get unit(): string;

  public validate(sample: Sample3D): boolean {
    return sample
      .toTriple()
      .every(v => Number.isInteger(v) && MIN_INT <= v && v < MAX_INT);
  }
}

export class TemperatureValue extends SensorScalarValue {
  public constructor(sample: number) {
    super(sample, MIN_INT, MAX_INT);
  }

  public static FromValue(
    value: number,
    round: boolean = true,
  ): TemperatureValue {
    let sample = value * 1e3;
    return new TemperatureValue(round ? Math.round(sample) : sample);
  }

  public get value(): number {
    return this.sample / 1e3;
  }

  public get unit() {
    return '°C';
  }
}

export class AccelerationValue extends Sensor32BitTripleValue {
  public constructor(sample: Sample3D);
  public constructor(x: number, y: number, z: number);
  public constructor(...args: any[]) {
    super(...args);
  }

  public static FromValue(
    x: number,
    y: number,
    z: number,
    round: boolean = true,
  ): AccelerationValue {
    return new AccelerationValue(
      new Sample3D(x, y, z).mapValues(v =>
        round ? Math.round(v * 1e6) : v * 1e6,
      ),
    );
  }

  public get value(): Sample3D {
    return this.sample.mapValues((v: number) => v / 1e6);
  }

  public get unit() {
    return 'g';
  }
}

export class AngularRateValue extends Sensor32BitTripleValue {
  public constructor(sample: Sample3D);
  public constructor(x: number, y: number, z: number);
  public constructor(...args: any[]) {
    super(...args);
  }

  public static FromValue(
    x: number,
    y: number,
    z: number,
    round: boolean = true,
  ): AngularRateValue {
    return new AngularRateValue(
      new Sample3D(x, y, z).mapValues(v =>
        round ? Math.round(v * 1e5) : v * 1e5,
      ),
    );
  }

  public get value(): Sample3D {
    return this.sample.mapValues((v: number) => v / 1e5);
  }

  public get unit() {
    return 'rad/s';
  }
}

export class VoltageValue extends SensorScalarValue {
  public constructor(sample: number) {
    super(sample, 0, MAX_UINT);
  }

  public static FromValue(value: number, round: boolean = true): VoltageValue {
    let sample = value * 1e6;
    return new VoltageValue(round ? Math.round(sample) : sample);
  }

  public get value(): number {
    return this.sample / 1e6;
  }

  public get unit() {
    return 'V';
  }
}

export class ECGValue extends SensorScalarValue {
  public constructor(sample: number) {
    super(sample, MIN_INT, MAX_INT);
  }

  public static FromValue(value: number, round: boolean = true): ECGValue {
    return new ECGValue(round ? Math.round(value) : value);
  }

  public get value(): number {
    return this.sample;
  }

  public get unit() {
    return 'nV';
  }
}

export class HumidityValue extends SensorScalarValue {
  public constructor(sample: number) {
    super(sample, 0, MAX_UINT);
  }

  public static FromValue(value: number, round: boolean = true): HumidityValue {
    let sample = value * 1e3;
    return new HumidityValue(round ? Math.round(sample) : sample);
  }

  public get value(): number {
    return this.sample / 1e3;
  }

  public get unit() {
    return '%RH';
  }
}

export class PressureValue extends SensorScalarValue {
  public constructor(sample: number) {
    super(sample, 0, MAX_ULONG);
  }

  public static FromValue(value: number, round: boolean = true): PressureValue {
    let sample = value * 1e3;
    return new PressureValue(round ? Math.round(sample) : sample);
  }

  public get value(): number {
    return this.sample / 1e3;
  }

  public get unit() {
    return 'Pa';
  }
}

export class MagneticFluxDensityValue extends Sensor32BitTripleValue {
  public constructor(sample: Sample3D);
  public constructor(x: number, y: number, z: number);
  public constructor(...args: any[]) {
    super(...args);
  }

  public static FromValue(
    x: number,
    y: number,
    z: number,
    round: boolean = true,
  ): MagneticFluxDensityValue {
    return new MagneticFluxDensityValue(
      new Sample3D(x, y, z).mapValues(v => (round ? Math.round(v) : v)),
    );
  }

  public get value(): Sample3D {
    return this.sample;
  }

  public get unit() {
    return 'nT';
  }
}
