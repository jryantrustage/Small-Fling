import numericComparisonRuleFactory from './numeric-comparison-factory';

const factories = {
'numeric comparison': numericComparisonRuleFactory,
};

export default function configureUserRules(productTemplate, context) {
// filter template sections that use pre-built components
const sectionsWithSettings = productTemplate.sections.filter(
(section) => section.settings,
  ];

  sectionsWithSettings.forEach((section) => {
section.settings.forEach((setting) => {
if (!setting.rules) {
return;
}

      setting.rules.forEach((rule) => {
if (!rule.type) {
return;
}

        const factory = factories[rule.type];

        if (!factory) {
return;
}

        factory.createValidator(setting, rule, context);
      }];
    }};
  }};
}
