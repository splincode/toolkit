import {type Config} from 'stylelint';

import angularInlineStyles from './syntaxes/angular-inline-styles';

const config: Config = {
    overrides: [
        {
            files: ['*.ts', '**/*.ts'],
            customSyntax: angularInlineStyles as unknown as Config['customSyntax'],
            rules: {'no-empty-source': null},
        },
    ],
};

export default config;
