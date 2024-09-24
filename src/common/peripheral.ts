export class Peripheral {
  public constructor(
    private _machine: string,
    private _name: string,
  ) {}

  public get machine(): string {
    return this._machine;
  }

  public get name(): string {
    return this._name;
  }
}
