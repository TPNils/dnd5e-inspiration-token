import { ReusableDiceTerm } from "./reusable-dice-term";

export class UtilsRoll {

  /**
   * @param originalRoll The original roll where you wish to retain any existing roll results from
   * @param newRollOrFormula What the new roll should be, either a formula or a factory which returns a new roll
   * @returns The new modified roll
   */
  public static async modifyRoll(originalRoll: Roll, newRollOrFormula: string | Roll | (() => Roll | Promise<Roll>)): Promise<{result: Roll, rollToDisplay: Roll | null}> {
    {
      const hasAnyOriginalEvaluated = originalRoll == null ? false : originalRoll.terms?.find(term => (term as any)._evaluated) != null;
      if (!hasAnyOriginalEvaluated) {
        return {result: await UtilsRoll.#parseRollRequest(newRollOrFormula), rollToDisplay: null};
      }
    }
    const mutableDiceOptions: ReusableDiceTerm.Options = {
      prerolledPool: {},
      newRolls: {},
    };

    for (const term of originalRoll.terms) {
      if (term instanceof DiceTerm) {
        const faces = String(term.faces) as `${number}`;
        if (!mutableDiceOptions.prerolledPool[faces]) {
          mutableDiceOptions.prerolledPool[faces] = [];
        }
        for (const result of term.results) {
          mutableDiceOptions.prerolledPool[faces].push(result.result);
        }
      }
    }

    try {
      // Wrap dice to be mutable
      ReusableDiceTerm.pushOptions(mutableDiceOptions);
  
      let rollResult = await UtilsRoll.#parseRollRequest(newRollOrFormula, true);

      let termsToDisplay: RollTerm[] = []
      for (const faceStr of Object.keys(mutableDiceOptions.newRolls) as `${number}`[]) {
        let activeResults = 0;
        for (const result of mutableDiceOptions.newRolls[faceStr]) {
          if (result.active) {
            activeResults++;
          }
        }
        termsToDisplay.push(new Die({
          faces: Number(faceStr),
          number: activeResults,
          results: mutableDiceOptions.newRolls[faceStr],
        }));
        termsToDisplay.push(new OperatorTerm({operator: '+'}));
      }
  
      if (termsToDisplay.length > 0) {
        termsToDisplay = termsToDisplay.splice(0, 1);
        termsToDisplay = (await UtilsRoll.#rollUnrolledTerms(termsToDisplay, {async: true})).results;
      }

      const allRolledResults: ReusableDiceTerm.Options['prerolledPool'] = {};
      for (const term of rollResult.terms) {
        if (term instanceof DiceTerm) {
          const faces = String(term.faces);
          if (!allRolledResults[faces]) {
            allRolledResults[faces] = [];
          }
          for (const result of term.results) {
            allRolledResults[faces].push(result.result);
          }
        }
      }
      // Any prerolledPool not consumed by mutable dice should be re-added
      const unusedTerms: RollTerm[] = [];
      for (const faces of Object.keys(mutableDiceOptions.prerolledPool) as `${number}`[]) {
        if (mutableDiceOptions.prerolledPool[faces].length === 0) {
          continue;
        }
        unusedTerms.push(new Die({
          faces: Number(faces),
          number: 0,
          results: mutableDiceOptions.prerolledPool[faces].map(r => ({result: r, active: false, discarded: true}))
        }))
      }

      if (unusedTerms.length > 0) {
        const terms = [...rollResult.terms];
        if (terms.length > 0) {
          terms.push(new OperatorTerm({operator: '+'}));
        }
        for (const unusedTerm of unusedTerms) {
          terms.push(unusedTerm);
          terms.push(new OperatorTerm({operator: '+'}));
        }
        terms.pop(); // Remove the trailing '+'
        rollResult = Roll.fromTerms((await UtilsRoll.#rollUnrolledTerms(terms, {async: true})).results);
      }
      return {
        result: rollResult,
        rollToDisplay: termsToDisplay.length > 0 ? Roll.fromTerms(termsToDisplay) : null,
      }
    } finally {
      ReusableDiceTerm.popOptions();
    }
  }

  static #parseRollRequest(newRollOrFormula: string | Roll | (() => Roll | Promise<Roll>), ensureEvaluated = false): Promise<Roll> {
    let roll: Promise<Roll>;
    if (typeof newRollOrFormula === 'string') {
      roll = Promise.resolve(new Roll(newRollOrFormula));
    } else if (newRollOrFormula instanceof Roll) {
      roll = Promise.resolve(newRollOrFormula);
    } else {
      let result = newRollOrFormula();
      if (!(result instanceof Promise)) {
        result = Promise.resolve(result);
      }
      roll = result;
    }

    if (ensureEvaluated) {
      roll = roll.then(r => {
        if (!r.total) {
          return r.evaluate({async: true});
        }
        return r;
      })
    }
    return roll;
  }

  static #rollUnrolledTerms(terms: RollTerm[], options?: Partial<RollTerm.EvaluationOptions> & {async: false}): {results: RollTerm[], newRolls?: RollTerm[]}
  static #rollUnrolledTerms(terms: RollTerm[], options?: Partial<RollTerm.EvaluationOptions> & {async: true}): Promise<{results: RollTerm[], newRolls?: RollTerm[]}>
  static #rollUnrolledTerms(terms: RollTerm[], options?: Partial<RollTerm.EvaluationOptions>): {results: RollTerm[], newRolls?: RollTerm[]} | Promise<{results: RollTerm[], newRolls?: RollTerm[]}> {
    const termResults$: Array<RollTerm | Promise<RollTerm>> = [];
    const newRolledTerms$: Array<RollTerm | Promise<RollTerm>> = [];

    // TODO allow dice terms to increase their nr of dice (for simplifying crits)
    for (let i = 0; i < terms.length; i++) {
      if (!(terms[i] as any)._evaluated) {
        // TODO evaluate the terms using the Roll class
        //  If an other module sends the rolls to an external service, you don't want it to send each individual term
        //  or cause a bug and it wont be send at all
        //  These modules will most likely hook into the Roll class
        const result = terms[i].evaluate(options);
        newRolledTerms$.push(result);
        termResults$.push(result);
      } else {
        termResults$.push(terms[i]);
      }
    }

    if (options.async === false) {
      if (newRolledTerms$.length > 0) {
        return {results: termResults$ as RollTerm[], newRolls: newRolledTerms$ as RollTerm[]};
      } else {
        return {results: termResults$ as RollTerm[]};
      }
    }

    return Promise.all([
      Promise.all(termResults$),
      Promise.all(newRolledTerms$),
    ]).then(([termResults, newRolledTerms]) => {
      if (newRolledTerms.length > 0) {
        return {results: termResults, newRolls: newRolledTerms};
      } else {
        return {results: termResults};
      }
    });
  }

}