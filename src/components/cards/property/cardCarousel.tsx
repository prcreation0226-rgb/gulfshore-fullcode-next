"use client";
import { Property } from "@/app/generated/prisma/client";
import ListingLabels from "@/components/property/listingLabels";
import SocialShare from "@/components/property/share-card";
import { WishListButton } from "@/components/property/wishlistButton";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Landmark } from "lucide-react";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import UrlMaker from "@/hooks/url-maker";
import Image from "next/image";
import { useState } from "react";

export default function CardCarousel({
	property,
}: {
	property: Property;
}) {
	const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});

	const media = property.images as any;
	let images: string[] = [];
	if (Array.isArray(media) && media.length > 0) {
		images = media
			.map((item: any) => {
				// Handle plain URL strings
				if (typeof item === "string" && item.trim() !== "") return item;
				// Handle objects with MediaURL (accept Photo category or missing category)
				if (typeof item?.MediaURL === "string" && item.MediaURL.trim() !== "") {
					if (!item.MediaCategory || item.MediaCategory === "Photo") return item.MediaURL;
				}
				return null;
			})
			.filter(Boolean) as string[];
	}
	const imageArray = images;

	return (
		<div className="p-0 bg-gray-300">
			<div className="relative overflow-hidden">
				{imageArray.length ? (
					<Carousel
						opts={{
							loop: true,
						}}>
						<CarouselContent>
							{imageArray.map((img: string, index: number) => (
								<CarouselItem key={index}>
									<AspectRatio
										ratio={16 / 9}
										className="w-full max-w-[456px]">
										{imageErrors[index] ? (
											<div className="w-full h-full bg-gradient-to-br from-[#F5F2EB] to-[#EBE6DC] flex flex-col items-center justify-center gap-2 border border-[#E8E4DC] rounded-t-2xl">
												<Landmark size={36} className="text-[#B89A6A] stroke-[1.25]" />
												<span className="text-[10px] tracking-[0.15em] uppercase font-semibold text-[#8C8270]">
													No Image Available
												</span>
											</div>
										) : (
											<Image
												src={img}
												alt={`${property.FullAddress}-${index}`}
												width={456}
												height={Math.round((426 * 9) / 16)}
												loading={index === 0 ? "eager" : "lazy"}
												priority={index === 0}
												unoptimized
												onError={() => setImageErrors(prev => ({ ...prev, [index]: true }))}
												className="object-cover group-hover:scale-105 transition duration-700 ease-in-out"
											/>
										)}
									</AspectRatio>
								</CarouselItem>
							))}
						</CarouselContent>

						<div
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}>
							<CarouselPrevious
								variant="outline"
								size="icon"
								className="left-2 cursor-pointer bg-white/80 hover:bg-white text-black border-0 shadow-sm top-1/2 md:left-2 h-8 w-8"
							/>
							<CarouselNext
								variant="outline"
								size="icon"
								className="right-2 cursor-pointer bg-white/80 hover:bg-white text-black border-0 shadow-sm top-1/2 md:right-2 h-8 w-8"
							/>
						</div>
					</Carousel>
				) : (
					<AspectRatio ratio={16 / 9}>
						<div className="w-full h-full bg-gradient-to-br from-[#F5F2EB] to-[#EBE6DC] flex flex-col items-center justify-center gap-2 border border-[#E8E4DC] rounded-t-2xl">
							<Landmark size={36} className="text-[#B89A6A] stroke-[1.25]" />
							<span className="text-[10px] tracking-[0.15em] uppercase font-semibold text-[#8C8270]">
								No Image Available
							</span>
						</div>
					</AspectRatio>
				)}

				{/* Status Labels */}
				<div className="absolute top-3 max-w-3/5 left-3 flex gap-2">
					<ListingLabels
						CreatedDate={
							property.OnMarketTimestamp ||
							property.ModificationTimestamp ||
							property.OnMarketDate ||
							""
						}
						
						spa={property.SpaYN || false}
						pool={property.PoolPrivateYN || false}
						waterFront={property.WaterfrontYN || false}
					/>
				</div>

				{/* Action Buttons */}
				<div
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
					className="absolute z-1 top-3 right-3 flex gap-2">
					<div className="flex gap-2 opacity-90 group-hover:opacity-100 transition-opacity duration-300">
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<div className="bg-white/90 backdrop-blur-sm text-center rounded-full flex items-center justify-center w-10 h-10 p-2 hover:bg-white hover:scale-110 transition-all duration-200 shadow-md">
										<SocialShare
											propertyUrl={UrlMaker(
												property.City,
												property.Community || "",
												property.FullAddress,
												property.MLSNumber
											)}
										/>
									</div>
								</TooltipTrigger>
								<TooltipContent className="bg-gray-900 text-white border-0">
									<p>Share Property</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>

						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<div className="hover:scale-110 transition-all duration-200">
										<WishListButton
											propertyId={property.id}
											isWishlisted={(property as any).isWishlisted}
										/>
									</div>
								</TooltipTrigger>
								<TooltipContent className="bg-gray-900 text-white border-0">
									<p>Save Property</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
				</div>
			</div>
		</div>
	);
}
