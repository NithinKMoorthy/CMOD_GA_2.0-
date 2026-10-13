export const initialSources = [
  { name: 'angularjs-app', provider: 'GitHub', repositories: 33, status: 'Connected' },
  { name: 'github-demo', provider: 'GitHub', repositories: 50, status: 'Connected' },
  { name: 'github-my-learning', provider: 'GitHub', repositories: 33, status: 'Connected' },
];

export const findings = [
  ['Deprecated and Unmaintained Packages', 'No remediation available.', 'Aug 24, 2026', 'Tech debt (comprehensive)', 'MKPMobile'],
  ['End-of-Life Expo SDK 38 Core Framework', 'No remediation available.', 'Aug 24, 2026', 'Tech debt (comprehensive)', 'MKPMobile'],
  ['No Dependency Manifest (package.json Missing)', 'No remediation available.', 'Aug 24, 2026', 'Tech debt (comprehensive)', 'LegacyDemoAWSTransformApplication_NodeJS'],
  ['Empty Repository - No Application Source Code', 'No remediation available.', 'Aug 24, 2026', 'Tech debt (comprehensive)', 'LegacyDemoAWSTransformApplication_NodeJS'],
  ['No test framework or test files', 'No remediation available.', 'Aug 24, 2026', 'Tech debt (comprehensive)', 'MyLearning'],
  ['Security Vulnerabilities in Application Code', 'No remediation available.', 'Aug 10, 2026', 'Tech debt (comprehensive)', 'LegacyNodeJSOrderingSystem'],
  ['jsonwebtoken v8 Known CVEs', 'No remediation available.', 'Aug 10, 2026', 'Tech debt (comprehensive)', 'LegacyNodeJSOrderingSystem'],
  ['AWS SDK v2 in Maintenance Mode', 'AWS/nodejs-aws-sdk-v2-to-v3', 'Aug 10, 2026', 'Tech debt (comprehensive)', 'LegacyNodeJSOrderingSystem'],
  ['Node.js 16.x Runtime End-of-Life', 'AWS/nodejs-version-upgrade', 'Aug 10, 2026', 'Tech debt (comprehensive)', 'LegacyNodeJSOrderingSystem'],
  ['Applicable transformation: AWS/nodejs-version-upgrade', 'AWS/nodejs-version-upgrade', 'Aug 10, 2026', 'Tech debt (quick)', 'LegacyNodeJSOrderingSystem'],
].map(([name, transformation, date, analysis, repository], id) => ({ id, name, transformation, date, analysis, repository, severity: 'High', status: 'Open' }));

export const remediations = [
  ['AngularJS → React migration plan', 'Custom/angularjs-to-react', 'Aug 27, 2026, 10:42 AM', 'In progress', 'CLI'],
  ['Test Remediation', 'AWS/nodejs-aws-sdk-v2-to-v3', 'Aug 24, 2026', 'Complete', 'Web'],
  ['Some remediation name', 'AWS/nodejs-version-upgrade', 'Aug 20, 2026', 'Complete', 'Web'],
  ['AWS SDK Remediation', 'AWS/nodejs-aws-sdk-v2-to-v3', 'Aug 10, 2026', 'Complete', 'Web'],
  ['aws-sdk-v2-to-v3', 'AWS/nodejs-aws-sdk-v2-to-v3', 'Aug 10, 2026', 'Complete', 'CLI'],
].map(([name, transformation, date, status, origin]) => ({ name, transformation, date, status, origin, outcomes: status === 'Complete' ? 1 : 0, repositories: 1, findings: 1 }));

export const analyses = [
  { date: 'Aug 27, 2026, 10:42 AM', name: 'AngularJS → React migration analysis', type: 'Modernization readiness', repository: 'payments-ui', repos: '1 of 1', findings: 8, infrastructure: 'Customer owned', status: 'In progress', progress: 62, origin: 'CLI' },
  { date: 'Aug 27, 2026, 9:18 AM', name: 'Commerce agentic readiness', type: 'Agentic readiness', repository: '3 repositories', repos: '2 of 3', findings: 4, infrastructure: 'AWS managed', status: 'In progress', progress: 38, origin: 'CLI' },
  { date: 'Aug 25, 2026', name: '—', type: 'Tech debt (quick)', repository: 'LegacyNodeJSOrderingSystem', repos: '1 of 1', findings: 0, infrastructure: 'AWS managed', status: 'Completed', progress: 100, origin: 'Web' },
  { date: 'Aug 24, 2026', name: 'Deep Analysis for these three', type: 'Tech debt (comprehensive)', repository: '3 repositories', repos: '3 of 3', findings: 17, infrastructure: 'AWS managed', status: 'Completed', progress: 100, origin: 'Web' },
  { date: 'Aug 10, 2026', name: '—', type: 'Tech debt (comprehensive)', repository: 'LegacyNodeJSOrderingSystem', repos: '1 of 1', findings: 10, infrastructure: 'Customer owned', status: 'Completed', progress: 100, origin: 'CLI' },
  { date: 'Aug 10, 2026', name: '—', type: 'Tech debt (quick)', repository: 'LegacyNodeJSOrderingSystem', repos: '1 of 1', findings: 2, infrastructure: 'Customer owned', status: 'Completed', progress: 100, origin: 'CLI' },
];

export const infrastructure = [
  ['AtxInfrastructureStack', 'Deployed', 'Batch', 'Aug 10, 2026'],
  ['AtxDispatcherStack', 'Deployed', 'Dispatcher', 'Aug 10, 2026'],
  ['AtxSecurityAgentStack-us-east-1', 'Deployed', 'Security agent', 'Aug 10, 2026'],
  ['atx-scheduler', 'Deployed', 'Scheduler', 'Aug 10, 2026'],
  ['atx-runner', 'Not deployed', 'EC2', '—'],
].map(([name, status, type, date]) => ({ name, status, type, date }));

export const analysisTypes = [
  ['Tech debt (quick)', 'A fast scan for common technical debt patterns.'],
  ['Tech debt (comprehensive)', 'A deeper portfolio assessment across code and dependencies.'],
  ['Agentic readiness', 'Evaluate repositories for agent-assisted development readiness.'],
  ['Modernization readiness', 'Identify modernization blockers and recommended next steps.'],
  ['Security', 'Assess security risks, vulnerable packages, and unsafe patterns.'],
];
