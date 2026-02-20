"use client"

import { useState } from "react"
import { signIn, getSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function LoginForm() {
   const router = useRouter()
   const [email, setEmail] = useState("")
   const [password, setPassword] = useState("")
   const [loading, setLoading] = useState(false)

   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault()
     setLoading(true)

     try {
       const result = await signIn("credentials", {
         email,
         password,
         redirect: false,
       })

        if (result?.error) {
          toast.error("Invalid email or password")
        } else {
          const session = await getSession()
          if (session?.user?.needs_onboarding) {
            router.push("/auth/onboard")
          } else {
            router.push("/")
            router.refresh()
          }
        }
     } catch {
       toast.error("An error occurred. Please try again.")
     } finally {
       setLoading(false)
     }
   }

   return (
     <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
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
          className="w-full px-3 py-2 border rounded-md border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 bg-[var(--accent)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
      >
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  )
}
