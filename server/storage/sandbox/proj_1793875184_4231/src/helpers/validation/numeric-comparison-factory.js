const operationMap = {
'<': (x, y) => x < y,
'>': (x, y) => x > y,
'=': (x, y) => x === y,
'<=': (x, y) => x <= y,
'>=': (x, y) => x >= y,
};

class NumericComparisonRuleFactory {
createValidator = (setting, rule, context) => {
const settingName = setting.settingCode;
const definition = rule.definition;

    const operation = operationMap[definition.operator];
if (!operation) {
return;
}

    const otherSetting = definition.otherSetting;
if (!otherSetting) {
return;
}

    const violationMessage = definition.violationMessage;
if (!violationMessage) {
return;
}

    context.addSettingValidationListener(settingName, (context, value) => {
const v1 = extractNumber(value);
const v2 = extractNumber(context.getSettingValue(otherSetting));

      if (!v1 || !v2) {
return;
}

      const violationExists = !operation(v1, v2);

      if (!violationExists) {
return;
}

      context.updateError(settingName, violationMessage);
    }};

    // add it to both settings in the comparison, so that this rule is run
// if either of the setting values change
context.addSettingValidationListener(otherSetting, (context, value) => {
const v1 = extractNumber(context.getSettingValue(settingName));
const v2 = extractNumber(value);

      if (!v1 || !v2) {
// if the values cannot be evaluated, then reset any previous error state
if (context.getErrorState(settingName) === violationMessage) {
context.updateError(settingName, '');
}
return;
}

      const violationExists = !operation(v1, v2);

      if (!violationExists) {
if (context.getErrorState(settingName) === violationMessage) {
context.updateError(settingName, '');
}
return;
}

      context.updateError(settingName, violationMessage);
    }};
};
}

const extractNumber = (value) => {
if (!value) {
return null;
}

  if (typeof value === 'number') {
return value;
}

  if (typeof value === 'string' && !isNaN(value)) {
return Number(value);
}

  return null;
};

const numericComparisonRuleFactory = new NumericComparisonRuleFactory();
export default numericComparisonRuleFactory;
