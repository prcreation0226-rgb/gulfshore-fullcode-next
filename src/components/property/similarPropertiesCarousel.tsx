"use client";
import React from "react";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
} from "@/components/ui/carousel";
import PropertyCard from "@/components/cards/property/property-card";
import { Property } from "@/app/generated/prisma/client";

export default function SimilarPropertiesCarousel({
	properties,
	development,
}: {
	properties: Property[];
	development: string;
}) {
	if (!properties || properties.length === 0) {
		return null;
	}

	return (
		<section className="my-8 w-11/12 mx-auto relative group">
			<h2 className="lg:text-2xl font-bold px-1 text-gray-900 mb-6">
				Explore More Properties in {development}
			</h2>
			<div className="px-4 md:px-8">
				<Carousel
					opts={{
						align: "start",
						loop: false,
					}}
					className="w-full"
				>
					<CarouselContent className="-ml-2 md:-ml-4">
						{properties.map((property: Property) => (
							<CarouselItem
								key={property.MLSNumber}
								className="pl-2 md:pl-4 basis-[85%] md:basis-1/2 lg:basis-1/3 relative group"
							>
								<PropertyCard {...property} showCarouselArrows={true} />
							</CarouselItem>
						))}
					</CarouselContent>
				</Carousel>
			</div>
		</section>
	);
}
