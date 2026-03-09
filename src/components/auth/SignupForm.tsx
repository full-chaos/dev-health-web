"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { resolveOrigin } from "@/lib/origin"
import { extractErrorMessage } from "@/lib/errorMessages"

export function SignupForm() {
   const router = useRouter()
   const [email, setEmail] = useState("")
   const [password, setPassword] = useState("")
   const [confirmPassword, setConfirmPassword] = useState("")
   const [fullName, setFullName] = useState("")
   const [loading, setLoading] = useState(false)

   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault()

     if (password !== confirmPassword) {
       toast.error("Passwords do not match")
       return
     }

     if (password.length < 12) {
       toast.error("Password must be at least 12 characters")
       return
     }

     setLoading(true)

     try {
       const backendUrl = resolveOrigin()
       const res = await fetch(`${backendUrl}/api/v1/auth/register`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           email,
           password,
           full_name: fullName || undefined,
         }),
       })

       if (!res.ok) {
         if (res.status === 429) {
           toast.error("Too many registration attempts. Please try again later.")
           return
         }
         try {
           const data = await res.json()
           toast.error(extractErrorMessage(data.detail, "Registration failed"))
         } catch {
           toast.error("Registration failed")
         }
         return
       }

       router.push("/auth/signin?registered=true")
     } catch {
       toast.error("An error occurred. Please try again.")
     } finally {
       setLoading(false)
     }
   }

   return (
     <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
       <div className="space-y-2">
        <label htmlFor="fullName" className="block text-sm font-medium text-[var(--foreground)]">
          Full Name
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full px-3 py-2 border rounded-md border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder="John Doe"
        />
      </div>
      
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-[var(--foreground)]">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded-md border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder="name@example.com"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-[var(--foreground)]">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={12}
          className="w-full px-3 py-2 border rounded-md border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--foreground)]">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={12}
          className="w-full px-3 py-2 border rounded-md border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 bg-[var(--accent)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
      >
        {loading ? "Creating account..." : "Create Account"}
      </button>

      <p className="text-center text-sm text-[var(--ink-muted)]">
        Already have an account?{" "}
        <Link href="/auth/signin" className="text-[var(--accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
