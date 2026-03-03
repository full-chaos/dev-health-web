import { afterEach, describe, expect, test, vi } from 'vitest'
import { renderWithToaster, screen, userEvent, waitFor, cleanup } from '@/test/utils'

const mockPush = vi.fn()
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}))

const { mockSignIn, mockGetSession } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  signIn: mockSignIn,
  getSession: mockGetSession,
}))

import { LoginForm } from '@/components/auth/LoginForm'

describe('LoginForm', () => {
  afterEach(() => {
    cleanup()
    mockPush.mockReset()
    mockRefresh.mockReset()
    mockSignIn.mockReset()
    mockGetSession.mockReset()
  })

  test('renders email and password fields', () => {
    renderWithToaster(<LoginForm />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  test('renders submit button', () => {
    renderWithToaster(<LoginForm />)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('shows "Invalid email or password" toast on generic signIn error', async () => {
    mockSignIn.mockResolvedValue({ error: 'CredentialsSignin', code: 'credentials', status: 401, ok: false, url: null })
    mockGetSession.mockResolvedValue(null)
    renderWithToaster(<LoginForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'tester@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText(/Invalid email or password/i)).toBeInTheDocument()
    })
  })

  test('shows verify-email banner when result.code === "email_verification_required"', async () => {
    mockSignIn.mockResolvedValue({ error: 'CredentialsSignin', code: 'email_verification_required', status: 401, ok: false, url: null })
    mockGetSession.mockResolvedValue(null)
    renderWithToaster(<LoginForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'tester@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/Please verify your email/i)).toBeVisible()
    })
  })

  test('redirects to /dashboard on successful login (no onboarding needed)', async () => {
    mockSignIn.mockResolvedValue({ error: undefined, code: undefined, status: 200, ok: true, url: null })
    mockGetSession.mockResolvedValue({ user: { needs_onboarding: false } })
    renderWithToaster(<LoginForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'tester@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  test('redirects to /auth/onboard when session.user.needs_onboarding is true', async () => {
    mockSignIn.mockResolvedValue({ error: undefined, code: undefined, status: 200, ok: true, url: null })
    mockGetSession.mockResolvedValue({ user: { needs_onboarding: true } })
    renderWithToaster(<LoginForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'tester@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/onboard')
    })
  })

  test('shows generic error toast on network failure', async () => {
    mockSignIn.mockRejectedValue(new Error('Network error'))
    renderWithToaster(<LoginForm />)

    await userEvent.type(screen.getByLabelText(/email/i), 'tester@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/An error occurred/i)).toBeInTheDocument()
    })
  })
})
