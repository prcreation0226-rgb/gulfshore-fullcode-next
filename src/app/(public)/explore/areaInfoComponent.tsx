import ReadMore from "@/components/property/readmore";
import GetSeoData from "@/hooks/getSeoData";
import Image from "next/image";

export default async function AreaInfoComponent({
	city,
	community,
}: {
	city: string;
	community?: string;
}) {
	const seoData = await GetSeoData({
		params: {
			city,
			developmentName: community || null,
			beds: "",
			baths: "",
			minPrice: "",
			maxPrice: "",
			builtYearMin: "",
			builtYearMax: "",
			sort: "",
			order: "",
			propertyTypes: [],
			postalCode: "",
			page: "",
			features: [],
		},
	});

	return (
		<div>
			<section>
				<div>
					<div>
						<div className="w-full overflow-hidden items-center grid grid-col-1 gap-4 ">
							{/* Image Section */}
							<div className="w-full relative overflow-hidden">
								<div className="relative overflow-hidden lg:h-full">
									<Image
										className="w-full h-full max-h-screen rounded-2xl overflow-hidden object-cover"
										width={800}
										height={800}
										loading="lazy"
										alt={`${city} Real Estate For Sale`}
										src={seoData?.content?.defaultImage || "/map-bg.webp"}
									/>
									<div className="absolute h-full bottom-0 left-0 right-0 text-center bg-linear-to-tr to-gray-800/60 via-black/50 from-black">
										<div className="flex flex-col items-center justify-center h-full">
											<span className="text-xl px-5 pb-6 lg:text-3xl font-bold text-white inline-flex items-center leading-tight">
												<div className="w-1 h-8 bg-accent rounded-full mr-2"></div>
												{seoData?.community || community || city} FL
											</span>
										</div>
									</div>
								</div>
							</div>

							{/* Content Section */}
							<div className="p-6 sm:p-8 lg:p-10">
								<div className="flex flex-col h-full justify-center">
									<div className="space-y-4">
										<div className="flex items-center space-x-2">
											<div className="w-1 h-8 bg-accent rounded-full"></div>
											<h2 className="text-2xl lg:text-4xl font-bold text-primary leading-tight">
												{seoData?.community || community || city} FL
											</h2>
										</div>

										<div className="prose prose-gray max-w-none lg:max-h-[480px] overflow-y-auto">
											<ReadMore className="text-gray-500 leading-relaxed">
												{seoData?.content?.infoText && seoData.content.infoText.trim().length > 0
													? seoData.content.infoText
															.replaceAll("*", "")
															.replaceAll("###", "•")
															.replaceAll("##", "•")
															.replaceAll("#", "")
													: `${city}, Florida: Your Gateway to Paradise Living\n\nNestled along Florida's pristine Gulf Coast, ${city} represents the epitome of luxury living, combining world-class amenities with natural beauty that captivates residents and visitors alike. This enchanting city has evolved from a small fishing village into one of America's most desirable destinations for those seeking an exceptional quality of life.`}
											</ReadMore>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
