* Dynamic panel estimation in Stata, via Roodman's xtabond2.
*
* Displayed in the vault's Code note. Run it against a panel with an `id`
* variable, a `year` variable, an outcome `y` and regressors `x1 x2`.

xtset id year

* #region snippet:core
* Always look at the bracket first: these two cost nothing and every GMM
* estimate has to land between them.
regress y L.y x1 x2                                  // pooled OLS, biased up
xtreg   y L.y x1 x2, fe                              // within, biased down

* System GMM: two-step, collapsed instruments, Windmeijer-corrected errors.
xtabond2 y L.y x1 x2 i.year, ///
    gmm(L.y, lag(2 4) collapse) ///
    iv(x1 x2 i.year, equation(level)) ///
    twostep robust small

* Difference GMM: the same call with the level equation switched off.
xtabond2 y L.y x1 x2 i.year, ///
    gmm(L.y, lag(2 4) collapse) ///
    iv(x1 x2 i.year) ///
    nolevel twostep robust small
* #endregion

* Report, every time: rho-hat with corrected errors, N, the instrument count,
* AR(1), AR(2), Hansen J, and difference-in-Hansen when the level moments are in.
