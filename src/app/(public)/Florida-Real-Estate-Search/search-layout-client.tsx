"use client";
import React from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Map from "./map";
import { SearchParamsResult } from "@/hooks/extractSearchParams";
import { Button } from "@/components/ui/button";
import { List, MapIcon } from "lucide-react";

export default function SearchLayoutClient({
	filterParams,
	children,
}: {
	filterParams: SearchParamsResult;
	children: React.ReactNode;
}) {
	const searchParams = useSearchParams();
	const view = searchParams.get("view");
	const isMapView = view === "map";
	const path = usePathname();

	return (
		<div className="flex flex-col lg:flex-row w-full h-full relative">
			{/* Left side: Map (only renders when isMapView is true) */}
			{isMapView && (
				<div className="w-full lg:w-[52%] xl:w-[54%] h-[55vh] lg:h-[calc(100vh-140px)] sticky top-[140px] z-10 lg:sticky lg:top-[140px] shrink-0">
					<Map filterParams={filterParams} />
				</div>
			)}

			{/* Right side / Bottom on Mobile: List View and Community Info */}
			<div
				className={`${
					isMapView
						? "flex w-full lg:w-[48%] xl:w-[46%] flex-col overflow-y-auto bg-white z-20 pt-4"
						: "w-full relative bg-white mx-auto overflow-y-auto flex flex-col"
				}`}
			>
				{children}
			</div>

			{/* Universal Floating Toggle Button for Mobile */}
			<a
				className="fixed bottom-3 z-50 right-3 md:hidden"
				href={`${path}?${(() => {
					const next = new URLSearchParams(searchParams.toString());
					next.set("view", isMapView ? "list" : "map");
					return next.toString();
				})()}`}
			>
				<Button
					className="rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.3)] border border-gray-800 bg-gray-900 text-white hover:bg-black hover:text-white md:h-10 px-5 py-2.5 flex items-center gap-2 font-medium"
				>
					{isMapView ? (
						<>
							<List className="w-4 h-4" /> <span>List View</span>
						</>
					) : (
						<>
							<MapIcon className="w-4 h-4" /> <span>Map View</span>
						</>
					)}
				</Button>
			</a>
		</div>
	);
}
