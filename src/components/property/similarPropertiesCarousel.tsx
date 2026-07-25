"use client";
import React from "react";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
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
						{properties.map((property, index) => (
							<CarouselItem
								key={index}
								className="pl-2 md:pl-4 basis-full md:basis-1/2 lg:basis-1/3 xl:basis-1/4"
							>
								<div className="h-full py-2">
									<PropertyCard {...(property as any)} />
								</div>
							</CarouselItem>
						))}
					</CarouselContent>
					<div className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity duration-300">
						<CarouselPrevious className="absolute -left-4 md:-left-8 top-1/2 -translate-y-1/2" />
						<CarouselNext className="absolute -right-4 md:-right-8 top-1/2 -translate-y-1/2" />
					</div>
				</Carousel>
			</div>
		</section>
	);
}
