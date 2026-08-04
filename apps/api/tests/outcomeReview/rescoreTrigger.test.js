import { afterEach, describe, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn }));

import { triggerRescoreOnConclusion } from '../../src/outcomeReview/rescoreTrigger.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

function childProcess() {
  const listeners = new Map();
  return {
    once: vi.fn((event, listener) => {
      listeners.set(event, listener);
      return childProcess;
    }),
    unref: vi.fn(),
    emit(event, ...args) {
      listeners.get(event)?.(...args);
    },
  };
}

describe('rescore trigger', () => {
  it('spawns one configured Python rescore process carrying both Profile ids', () => {
    process.env.RESCORE_ON_CONCLUSION_ENABLED = 'true';
    process.env.RESCORE_PYTHON = 'test-venv/Scripts/python.exe';
    process.env.RESCORE_MODULE = 'test.rescore';
    process.env.RESCORE_ARTIFACT = 'tmp/model.joblib';
    const child = childProcess();
    spawn.mockReturnValue(child);

    triggerRescoreOnConclusion('freelancer-profile', 'client-profile');

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      'test-venv/Scripts/python.exe',
      [
        '-m',
        'test.rescore',
        'freelancer-profile',
        'client-profile',
        '--artifact',
        'tmp/model.joblib',
      ],
      expect.objectContaining({ stdio: ['ignore', 'ignore', 'pipe'] }),
    );
  });

  it('logs a missing process but does not throw', () => {
    process.env.RESCORE_ON_CONCLUSION_ENABLED = 'true';
    const child = childProcess();
    spawn.mockReturnValue(child);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => triggerRescoreOnConclusion('freelancer-profile', 'client-profile')).not.toThrow();
    child.emit('error', new Error('ENOENT'));

    expect(error).toHaveBeenCalledWith(expect.stringContaining('ENOENT'));
    error.mockRestore();
  });
});
