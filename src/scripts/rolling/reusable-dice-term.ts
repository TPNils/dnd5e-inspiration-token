interface DiceTermResult extends DiceTerm.Result {
  notRolled?: boolean;
}

export namespace ReusableDiceTerm {
  export interface Options {
    /** Can only use these options while the context is active */
    prerolledPool: {[face: `${number}`]: number[]};
    newRolls: {[face: `${number}`]: Die['results']};
  }
}

/**
 * Allow to change the number of dice, its modifiers and allowing to reevaluate it.
 */
export class ReusableDiceTerm extends Die {

  private static optionsStack: ReusableDiceTerm.Options[] = [];
  private static originalDieRoll: Die['roll'];
  private static originalDieEvaluate: Die['evaluate'];
  public static pushOptions(options: ReusableDiceTerm.Options): void {
    if (ReusableDiceTerm.optionsStack.length === 0) {
      ReusableDiceTerm.originalDieRoll = Die.prototype.roll;
      ReusableDiceTerm.originalDieEvaluate = Die.prototype.evaluate;
      Die.prototype.roll = ReusableDiceTerm.prototype.roll;
      Die.prototype.evaluate = ReusableDiceTerm.prototype.evaluate;
    }
    ReusableDiceTerm.optionsStack.push(options);
  }
  public static popOptions(): void {
    ReusableDiceTerm.optionsStack.pop();
    if (ReusableDiceTerm.optionsStack.length === 0) {
      Die.prototype.roll = ReusableDiceTerm.originalDieRoll;
      Die.prototype.evaluate = ReusableDiceTerm.originalDieEvaluate;
    }
  }

  private static getOptions(): ReusableDiceTerm.Options | null {
    if (ReusableDiceTerm.optionsStack.length === 0) {
      return null;
    }
    return ReusableDiceTerm.optionsStack[ReusableDiceTerm.optionsStack.length - 1];
  }

  public static SERIALIZE_ATTRIBUTES: string[] = [...Die.SERIALIZE_ATTRIBUTES];

  private deactivatedResults: number[] = [];
  public evaluate(options?: Partial<RollTerm.EvaluationOptions & { async: false }>): this;
  public evaluate(options: Partial<RollTerm.EvaluationOptions> & { async: true }): Promise<this>;
  public evaluate(options: Partial<RollTerm.EvaluationOptions> = {}): this | Promise<this> {
    if (this.number > 999) {
      throw new Error(`You may not evaluate a DiceTerm with more than 999 requested results`);
    }
    this._evaluated = true;
    this.deactivatedResults = this.results.filter((r: DiceTermResult) => !r.notRolled).map(r => r.result);
    this.results = []; // Simply discard your results, assume all previously rolled dice are in MutableDiceTerm.getOptions()
    for (let i = 0; i < this.number; i++) {
      this.roll({minimize: options.minimize, maximize: options.maximize});
    }
    this._evaluateModifiers();
    for (const deactivated of this.deactivatedResults) {
      this.results.push({result: deactivated, active: false, discarded: true})
    }
    this.deactivatedResults = [];
    
    return options.async ? Promise.resolve(this) : this;
  }

  public roll(args: { minimize: boolean; maximize: boolean; } = {minimize: false, maximize: false}): DiceTerm.Result {
    // Don't need to roll min or max rolls
    if (args.minimize || args.maximize) {
      const result: DiceTermResult = ReusableDiceTerm.originalDieRoll.call(this, args);
      result.notRolled = true; // Track that this was never rolled and can be discarded on reroll (without min/max)
      this.results.push(result);
      return result;
    }

    // Recycle deactivated rolls => first find rolls listed specific for this roll
    const options = ReusableDiceTerm.getOptions();
    if (this.deactivatedResults.length > 0) {
      const result: DiceTerm.Result = {
        result: options.prerolledPool?.[String(this.faces)].splice(0, 1)[0],
        active: true
      };
      this.results.push(result);
      // Remove from global preroll, should have already been listed
      const globalPrerolled: number[] = options?.prerolledPool?.[String(this.faces)];
      if (globalPrerolled) {
        const index = globalPrerolled.indexOf(result.result);
        if (index !== -1) {
          globalPrerolled.splice(index, 1);
        }
      }
      return result;
    }

    // Recycle deactivated rolls => fallback to 
    if (options?.prerolledPool?.[String(this.faces)]?.length > 0) {
      const result: DiceTerm.Result = {
        result: options.prerolledPool?.[String(this.faces)].splice(0, 1)[0],
        active: true
      };
      this.results.push(result);
      return result;
    }
    const result = ReusableDiceTerm.originalDieRoll.call(this, args);
    // MutableDiceTerm.originalDieRoll already adds result to this.results
    if (options) {
      if (options.newRolls[String(this.faces)] == null) {
        options.newRolls[String(this.faces)] = [];
      }
      options.newRolls[String(this.faces)].push(result)
    }
    return result;
  }
  
}