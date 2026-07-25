"use client";
import OwnerCard from "@/components/cards/property/ownerCard";
import PropertyCard from "@/components/cards/property/property-card";
import PropertySkeletonCard from "@/components/cards/property/propertySkeletonCard";
import CitiesSection from "@/components/city/cities-section";
import PaginationComponent, {
	PaginationComponent2,
} from "@/components/global/paginationComponent";
import { Button } from "@/components/ui/button";
import {
	clearFilters,
	fetchProperties,
	setFilters,
} from "@/state/slices/searchSlice";
import { EMPTY_FILTERS } from "@/lib/search-filters";
import { AppDispatch, RootState } from "@/state/store";
import { SearchX } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import React, { Suspense } from "react";
import { useDispatch, useSelector } from "react-redux";

export default function MapViewList({
	filter,
	view,
}: {
	view: any;
	filter: any;
}) {
	const {
		mobileMapView,
		success,
		list,
		listView,
		error,
		loading,
		total,
		totalPages,
		filters,
		details,
	} = useSelector((state: RootState) => state.search);
	const path = usePathname();
	const searchParams = useSearchParams();

	const dispatch = useDispatch<AppDispatch>();
	const filterString = JSON.stringify(filter);

	const topRef = React.useRef<HTMLDivElement>(null);
	React.useEffect(() => {
		if (view === "map" && details && details.MLSNumber && topRef.current) {
			topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, [details?.MLSNumber, view]);

	const orderedList = React.useMemo(() => {
		if (!details || !details.MLSNumber || view !== "map") return list;
		const selectedIndex = list.findIndex(
			(p: any) => p.MLSNumber === details.MLSNumber
		);
		if (selectedIndex <= 0) return list;
		const selectedItem = list[selectedIndex];
		const rest = list.filter((p: any) => p.MLSNumber !== details.MLSNumber);
		return [selectedItem, ...rest];
	}, [list, details, view]);
	React.useEffect(() => {
		if (view !== "map") {
			dispatch(
				setFilters({
					...EMPTY_FILTERS,
					...filter,
				})
			);
			dispatch(fetchProperties());
		}
	}, [dispatch, view, filterString]);

	const gridClass =
		view === "map"
			? "grid mx-2 xl:mx-4 gap-2 lg:grid-cols-1 xl:grid-cols-2 md:grid-cols-1"
			: "grid w-11/12 max-w-[1600px] mx-auto gap-4 lg:grid-cols-3 grid-cols-1 xl:grid-cols-3 md:grid-cols-2";

	if (loading) {
		return (
			<div className={"h-full flex justify-center items-center"}>
				<div className={gridClass}>
					{Array.from({ length: 18 }).map((_, i) => (
						<PropertySkeletonCard key={i} />
					))}
				</div>
			</div>
		);
	}

	if ((success && total === 0) || error) {
		return (
			<div
				className={
					"w-full overflow-x-hidden flex flex-col items-center justify-center text-center py-20 px-4 bg-muted/10 rounded-lg border border-border"
				}>
				<div className="mb-6">
					<SearchX className="w-12 h-12 text-muted-foreground" />
				</div>
				<h2 className="text-xl font-semibold text-foreground mb-2">
					No Listing Found
				</h2>
				<p className="text-sm text-muted-foreground mb-6 max-w-md">
					Try adjusting your filters or explore other locations.
				</p>

				<Button
					onClick={() => {
						dispatch(clearFilters());
						history.pushState(
							null,
							"",
							"/Florida-Real-Estate-Search"
						);
					}}
					variant="default"
					className="text-sm">
					Reset Filters
				</Button>

				<hr />
				<div className={`bg-white w-dvw rounded-t-xl mt-20`}>
					<div className="flex flex-col text-start items-start justify-start px-5 md:px-6 lg:px-7">
						<div className="items-start justify-start flex flex-col">
							<h2 className="lg:text-xl text-lg text-start font-semibold lg:font-medium">
								Search By City
							</h2>
							<p className="py-2 text-start text-xs md:text-sm lg:font-medium font-semibold lg:text-base text-gray-700">
								Explore Active Listings in each{" "}
								<span className="text-(--primary-color) font-semibold">
									SW Florida City
								</span>
								.
							</p>
						</div>
					</div>
					<Suspense>
						<CitiesSection />
					</Suspense>
				</div>
			</div>
		);
	}

	const currentStatus = filters.status || "Active";

	const handleStatusChange = (newStatus: string) => {
		// When "All Properties" → auto sort by OnMarketDate (New Launch)
		// so newest listings appear first by their actual market date
		const sortOverride = newStatus === "All"
			? { sort: "OnMarketDate", order: "desc" }
			: { sort: "CreatedDate", order: "desc" };

		const nextFilters = {
			...filters,
			status: newStatus,
			page: "1",
			...sortOverride,
		};
		dispatch(setFilters(nextFilters));
		dispatch(fetchProperties());

		// Update URL parameters
		const nextParams = new URLSearchParams(searchParams.toString());
		if (newStatus === "Active") {
			nextParams.delete("status");
			nextParams.set("sort", "CreatedDate");
			nextParams.set("order", "desc");
		} else {
			nextParams.set("status", newStatus);
			nextParams.set("sort", sortOverride.sort);
			nextParams.set("order", sortOverride.order);
		}
		const newUrl = `${path}?${nextParams.toString()}`;
		window.history.pushState(null, "", newUrl);
	};

	return (
		<div>
			{/* Status Tabs (Active / Sold / All) */}
			<div className="w-11/12 max-w-[1600px] mx-auto mb-6 flex border-b border-[#E8E4DC] gap-6 text-sm">
				<button
					onClick={() => handleStatusChange("Active")}
					className={`pb-2.5 font-medium border-b-2 transition-all ${
						currentStatus === "Active"
							? "border-[#B89A6A] text-[#1C1712] font-semibold"
							: "border-transparent text-[#7A7060] hover:text-[#1C1712]"
					}`}
				>
					Active Listings
				</button>
				<button
					onClick={() => handleStatusChange("Sold")}
					className={`pb-2.5 font-medium border-b-2 transition-all ${
						currentStatus === "Sold"
							? "border-[#B89A6A] text-[#1C1712] font-semibold"
							: "border-transparent text-[#7A7060] hover:text-[#1C1712]"
					}`}
				>
					Sold Properties
				</button>
				<button
					onClick={() => handleStatusChange("All")}
					className={`pb-2.5 font-medium border-b-2 transition-all ${
						currentStatus === "All"
							? "border-[#B89A6A] text-[#1C1712] font-semibold"
							: "border-transparent text-[#7A7060] hover:text-[#1C1712]"
					}`}
				>
					All Properties
				</button>
			</div>

			<div ref={topRef} className="scroll-mt-4" />
			<div className={gridClass}>
				{(view === "map" ? orderedList : list).map((property, i: number) => (
					<PropertyCard
						key={(property as any).MLSNumber || i}
						isSelected={details?.MLSNumber === (property as any).MLSNumber}
						{...(property as any)}
					/>
				))}
			</div>

			{Number(totalPages) >= 1 && (
				<PaginationComponent2
					currentPage={Number(filters.page) || 1}
					totalPages={Number(totalPages)}
				/>
			)}
			<section className="py-2 mt-4 bg-white/10">
				<div className="flex justify-center items-center">
					<OwnerCard layout={view === "map" ? "column" : "row"} />
				</div>
			</section>

		</div>
	);
}
