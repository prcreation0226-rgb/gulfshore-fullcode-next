"use client";

import React, { useState } from "react";
import MarketReport from "@/components/market-report/MarketReport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function AdminMarketReportsPage() {
	const [cityInput, setCityInput] = useState("");
	const [activeCity, setActiveCity] = useState("Naples"); // Default city

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		if (cityInput.trim()) {
			setActiveCity(cityInput.trim());
		}
	};

	return (
		<div className="flex flex-col gap-6 w-full max-w-7xl mx-auto py-8 px-4">
			<div>
				<h1 className="text-3xl font-bold tracking-tight mb-2">Market Reports</h1>
				<p className="text-muted-foreground">
					View the live Monthly Market Report statistics for any city. These are exactly what users see on the public website.
				</p>
			</div>

			<div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
				<form onSubmit={handleSearch} className="flex gap-4 items-end max-w-md">
					<div className="flex-1 space-y-2">
						<label className="text-sm font-medium">Search City</label>
						<Input 
							placeholder="e.g. Naples, Fort Myers..." 
							value={cityInput}
							onChange={(e) => setCityInput(e.target.value)}
						/>
					</div>
					<Button type="submit">
						<Search className="w-4 h-4 mr-2" />
						Generate Report
					</Button>
				</form>
			</div>

			<div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden pt-4">
				<MarketReport city={activeCity} />
			</div>
		</div>
	);
}
