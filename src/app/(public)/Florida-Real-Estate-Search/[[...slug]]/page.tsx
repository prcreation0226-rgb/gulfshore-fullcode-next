import ExtractSearchParams from "@/hooks/extractSearchParams";
import MapViewList from "./mapViewList";
import React from "react";
import { parseFiltersFromQuery } from "@/lib/search-filters";
import CityFAQ from "@/components/city/city-faq";

export default async function ListingsPage({
	params,
	searchParams,
}: {
	params: Promise<{
		slug?: string[];
	}>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	let data;
	const slug = (await params).slug || [];
	const sp = await searchParams;
	const view = typeof sp.view === "string" ? sp.view : undefined;
	const filterFromSlug = await ExtractSearchParams(slug);
	const filterFromQuery = parseFiltersFromQuery(sp);
	const filter = {
		...filterFromSlug,
		...filterFromQuery,
		propertyTypes:
			filterFromQuery.propertyTypes ?? filterFromSlug.propertyTypes,
		features: filterFromQuery.features ?? filterFromSlug.features,
		page: filterFromQuery.page ?? filterFromSlug.page ?? "1",
	};

	return (
		<>
			<MapViewList
				filter={filter}
				view={view === "map" ? "map" : "list"}
			/>
			<CityFAQ city={filter.city} />
		</>
	);
}
