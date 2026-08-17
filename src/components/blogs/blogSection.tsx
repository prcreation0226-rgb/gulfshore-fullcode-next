import { BookOpen, Facebook } from "lucide-react";
import BlogArticleCard from "@/components/blogs/blogCard";

interface BlogSectionProps {
	category?: string;
	title?: string;
	subtitle?: string;
}

export default async function BlogSection({ 
	category, 
	title = "Real Estate Blogs", 
	subtitle = "Tips, trends, and insights from real estate experts" 
}: BlogSectionProps = {}) {
	const fetchBlogArticles = async () => {
		try {
			const baseUrl =
				process.env.NEXT_PUBLIC_SERVER_URL ||
				process.env.NEXT_PUBLIC_BASE_URL ||
				"http://localhost:3000";
				
			let url = `${baseUrl}/api/v2/blogs?published=true&limit=4`;
			if (category) {
				url += `&category=${category}`;
			}
			
			const response = await fetch(url, {
				next: { revalidate: 10 },
			});
			if (!response.ok) return [];
			const data = await response.json();
			return Array.isArray(data) ? data : [];
		} catch (error) {
			console.error("Error fetching blog articles:", error);
			return [];
		}
	};

	const blogArticles = await fetchBlogArticles();

	if (!blogArticles || blogArticles.length === 0) {
		return null; // or a fallback UI
	}

	return (
		<section className="space-y-6 py-12 container mx-auto px-4">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
						{category === "facebook" ? <Facebook className="w-6 h-6 text-blue-600" /> : <BookOpen className="w-6 h-6 text-primary" />}
						{title}
					</h3>
					<p className="text-muted-foreground mt-1 text-sm">
						{subtitle}
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 border-t border-border pt-8">
				{blogArticles.map((article: any) => (
					<BlogArticleCard key={article.id || article.slug} article={article} />
				))}
			</div>
		</section>
	);
}
