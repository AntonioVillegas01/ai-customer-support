import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/providers/auth-provider';
import { LoginForm, RegisterForm } from './auth-forms';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('auth forms', () => {
  it('renders login fields and client validation', async () => {
    render(<AuthProvider><LoginForm /></AuthProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/Invalid email/)).toBeInTheDocument();
  });

  it('renders register fields and password validation', async () => {
    render(<AuthProvider><RegisterForm /></AuthProvider>);
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/String must contain at least 12 character/)).toBeInTheDocument();
  });
});
