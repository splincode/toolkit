import {type Config} from 'stylelint';

import angular from './angular';
import recommended from './configs/recommended';

const config: Config = {
    ...recommended,
    overrides: [...(recommended.overrides ?? []), ...(angular.overrides ?? [])],
};

export default config;
