import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest.config.js does not set test.globals=true, so @testing-library/react's
// own auto-cleanup (which detects a global afterEach) never fires. Without this,
// DOM from one test leaks into the next within the same file.
afterEach(cleanup);
