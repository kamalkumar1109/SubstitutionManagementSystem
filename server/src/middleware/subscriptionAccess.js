const { AppError } = require("../utils/AppError");
const { USER_ROLES } = require("../config/constants");
const { evaluateAccess } = require("../services/subscriptionService");

/**
 * Future access control for school workspaces.
 * Disabled unless SUBSCRIPTION_ENFORCEMENT=true so development is not locked out.
 */
function requireActiveSubscription(req, res, next) {
  Promise.resolve()
    .then(async () => {
      if (!req.user) throw AppError.unauthorized();
      if (req.user.role === USER_ROLES.SUPER_ADMIN) return next();
      if (!req.schoolId) return next();
      const access = await evaluateAccess(req.schoolId);
      req.subscriptionAccess = access;
      if (!access.enforcementEnabled) return next();
      if (access.allowed) return next();
      throw AppError.paymentRequired(
        "This school’s subscription is not active. Renew to continue using substitution tools."
      );
    })
    .catch(next);
}

module.exports = { requireActiveSubscription };
