import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/app/App.jsx';

describe('App', () => {
  it('renders the Home route at "/"', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Canary' })).toBeInTheDocument();
  });
});
