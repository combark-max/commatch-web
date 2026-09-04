import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';

const projectRoot = resolve(import.meta.dirname, '../..');

const loadModule = (relativePath, requireOverrides) => {
  const filename = resolve(projectRoot, relativePath);
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  const context = vm.createContext({
    console,
    exports: loadedModule.exports,
    module: loadedModule,
    require: (specifier) => {
      if (specifier in requireOverrides) return requireOverrides[specifier];
      throw new Error(`Unexpected require: ${specifier}`);
    },
  });
  const wrapper = new vm.Script(`(function (exports, require, module, __filename, __dirname) { ${compiled}\n})`, {
    filename,
  }).runInContext(context);
  wrapper(loadedModule.exports, context.require, loadedModule, filename, dirname(filename));
  return loadedModule.exports;
};

const policyModule = loadModule('lib/consent/policy.ts', {
  'server-only': {},
});

const serverModule = loadModule('lib/consent/server.ts', {
  'server-only': {},
  '@/lib/supabase/server': { createServerSupabaseClient: () => null },
  '@/lib/consent/policy': policyModule,
});

const acceptedEvent = (consentType, documentVersion) => ({
  consentType,
  latestAction: 'accepted',
  documentVersion,
  createdAt: '2026-09-04T00:00:00.000Z',
});

test('new terms and privacy versions require only those documents while preserving adult confirmation', () => {
  const assessment = serverModule.assessConsentAccess('2026-01-01T00:00:00.000Z', {
    terms: acceptedEvent('terms', 'terms-v1.0'),
    privacy: acceptedEvent('privacy', 'privacy-v1.0'),
    adult_confirmation: acceptedEvent('adult_confirmation', 'adult-confirmation-v1.0'),
  });

  assert.equal(assessment.canAccess, false);
  assert.deepEqual(Array.from(assessment.blockingTypes), ['terms', 'privacy']);
  assert.equal(
    assessment.requirements.find(({ type }) => type === 'adult_confirmation').satisfaction.status,
    'satisfied',
  );
});

test('new terms and privacy acceptances combine with the existing adult confirmation', () => {
  const assessment = serverModule.assessConsentAccess('2026-01-01T00:00:00.000Z', {
    terms: acceptedEvent('terms', 'terms-v1.1'),
    privacy: acceptedEvent('privacy', 'privacy-v1.1'),
    adult_confirmation: acceptedEvent('adult_confirmation', 'adult-confirmation-v1.0'),
  });

  assert.equal(assessment.canAccess, true);
  assert.deepEqual(Array.from(assessment.blockingTypes), []);
});

const flattenElements = (value, elements = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => flattenElements(item, elements));
    return elements;
  }
  if (!value || typeof value !== 'object') return elements;

  if ('type' in value && 'props' in value) {
    elements.push(value);
    if (typeof value.type === 'function') {
      flattenElements(value.type(value.props), elements);
    }
    flattenElements(value.props.children, elements);
  }
  return elements;
};

test('re-consent UI hides completed adult confirmation and links the terms summary to the official document', () => {
  let stateCall = 0;
  const react = {
    useActionState: (_action, initialState) => [initialState, () => {}, false],
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useState: (initialValue) => {
      stateCall += 1;
      return [stateCall === 3 ? 'terms' : initialValue, () => {}];
    },
  };
  const icon = () => null;
  const consentFormModule = loadModule('app/consent/ConsentForm.tsx', {
    react,
    'react/jsx-runtime': jsxRuntime,
    'lucide-react': {
      Check: icon,
      ChevronRight: icon,
      Loader2: icon,
      ShieldCheck: icon,
      X: icon,
    },
    'next/link': ({ children, ...props }) => jsxRuntime.jsx('a', { ...props, children }),
    './actions': { submitRequiredConsents: () => {} },
  });

  const tree = consentFormModule.default({
    completedTypes: ['adult_confirmation'],
    documentVersions: {
      terms: 'terms-v1.1',
      privacy: 'privacy-v1.1',
      adult_confirmation: 'adult-confirmation-v1.0',
    },
    adultConfirmationLabel: '[필수] 본인은 만 19세 이상임을 확인합니다.',
  });
  const elements = flattenElements(tree);
  const consentNames = elements
    .filter(({ type, props }) => type === 'input' && props.name?.startsWith('consent_'))
    .map(({ props }) => props.name);

  assert.deepEqual(consentNames, ['consent_terms', 'consent_privacy']);
  assert.ok(elements.some(({ props }) => props.href === '/terms'));
});
