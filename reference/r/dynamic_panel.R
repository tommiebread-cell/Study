# Dynamic panel estimation in R, via plm::pgmm.
#
# Displayed in the vault's Code note. Expects a data frame `panel_data` with
# columns id, year, y, x1, x2.

library(plm)

pdata <- pdata.frame(panel_data, index = c("id", "year"))

# #region snippet:core
# The bracket first: pooled OLS above, within below, GMM has to land between.
ols <- plm(y ~ lag(y, 1) + x1 + x2, data = pdata, model = "pooling")
fe  <- plm(y ~ lag(y, 1) + x1 + x2, data = pdata, model = "within")

# System GMM: levels and differences stacked, collapsed instruments, two-step.
sys_gmm <- pgmm(
  y ~ lag(y, 1) + x1 + x2 | lag(y, 2:4),
  data           = pdata,
  effect         = "twoways",
  model          = "twosteps",
  transformation = "ld",
  collapse       = TRUE
)

# Difference GMM: the same call with transformation = "d".
diff_gmm <- update(sys_gmm, transformation = "d")

# robust = TRUE is where the Windmeijer correction lives — it belongs in
# summary(), not in pgmm().
summary(sys_gmm, robust = TRUE)
# #endregion

# mtest(sys_gmm, order = 2) for AR(2); sargan(sys_gmm) for the J statistic.
# Compare coef(sys_gmm)[1] against coef(fe)[1] and coef(ols)[2].
