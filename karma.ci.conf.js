// karma.ci.conf.js — CI launcher for the pure-logic unit gate.
//
// The Angular CLI generates a Karma config on the fly when none is given, but that config's ChromeHeadless
// runs WITH the sandbox — which fails on GitHub's ubuntu runners. This adds a launcher with the flags CI
// needs and changes nothing else. Local runs do not need this file (plain --browsers=ChromeHeadless works).
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    reporters: ['progress'],
    browsers: ['ChromeHeadlessCI'],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        // --no-sandbox: required in the runner's container.
        // --disable-dev-shm-usage: the runner's /dev/shm is small; without this Chrome can crash mid-run.
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
    restartOnFileChange: false,
    singleRun: true,
  });
};
