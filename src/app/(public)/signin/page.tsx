import { SignIn } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
	const resolvedParams = await searchParams;
	const redirectUrl = resolvedParams.redirect_url || "/";
	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
			{/* Back Button */}
			<div className="absolute top-6 left-8 z-20">
				<Link href="/" className="flex items-center gap-2 text-sm font-semibold text-[#d90429] hover:underline cursor-pointer">
					<ArrowLeft size={16} />
					<span>Back to Home</span>
				</Link>
			</div>
			<SignIn 
				routing="path" 
				path="/signin" 
				signUpUrl={`/signup${resolvedParams.redirect_url ? `?redirect_url=${encodeURIComponent(resolvedParams.redirect_url)}` : ""}`}
				fallbackRedirectUrl={redirectUrl} 
				forceRedirectUrl={resolvedParams.redirect_url ? redirectUrl : undefined}
			/>
		</div>
	);
}
