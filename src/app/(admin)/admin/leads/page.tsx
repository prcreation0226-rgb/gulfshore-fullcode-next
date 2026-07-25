"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Phone, Mail, Calendar, Eye, Trash2, Edit } from "lucide-react";
import { IPrismaLead } from "@/models/leads";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// -------------------- CONFIG --------------------
const statusOptions = [
	{ value: "new", label: "New", color: "bg-blue-100 text-blue-800" },
	{
		value: "contacted",
		label: "Contacted",
		color: "bg-yellow-100 text-yellow-800",
	},
	{
		value: "interested",
		label: "Interested",
		color: "bg-purple-100 text-purple-800",
	},
	{
		value: "closed",
		label: "Closed",
		color: "bg-green-100 text-green-800",
	},
];

const sourceOptions = [
	{
		value: "General",
		color: "bg-purple-100 text-purple-800",
	},
	{
		value: "SignUp",
		color: "bg-green-100 text-green-800",
	},
	{
		value: "Contact_Form",
		color: "bg-violet-100 text-violet-800",
	},
	{
		value: "Tour_Request",
		color: "bg-amber-100 text-amber-800",
	},
	{
		value: "Home_Valuation",
		color: "bg-emerald-100 text-emerald-800",
	},
	{
		value: "Other",
		color: "bg-gray-100 text-gray-800",
	},
];

const SourceFilters = [
	"All Sources",
	"SignUp",
	"Contact_Form",
	"Tour_Request",
	"Home_Valuation",
	"General",
	"Other",
];

// -------------------- PAGE --------------------
export default function LeadsPage() {
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const [sourceFilter, setSourceFilter] = useState("All Sources");
	const [leads, setLeads] = useState<IPrismaLead[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [quickTagLeadId, setQuickTagLeadId] = useState<string | null>(null);

	const TAG_OPTIONS = ["Buyer", "Seller", "Hot Lead", "Cold Lead", "Investor"];

	const handleQuickTag = async (leadId: string, tag: string, currentTags: string[]) => {
		const has = currentTags.includes(tag);
		const newTags = has ? currentTags.filter((t) => t !== tag) : [...currentTags, tag];
		try {
			const res = await fetch(`/api/leads/${leadId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tags: newTags }),
			});
			if (!res.ok) throw new Error("Failed");
			setLeads((prev) =>
				prev.map((l) => (l.id === leadId ? { ...l, tags: newTags } : l))
			);
			toast.success(has ? `Removed "${tag}"` : `Tagged as "${tag}"`);
		} catch {
			toast.error("Failed to update tag");
		}
	};
	const [formData, setFormData] = useState<{
		firstName: string;
		lastName: string;
		email: string;
		phone: string;
		status: string;
		source: string;
		tags: string[];
		lastContactedAt: string;
	}>({
		firstName: "",
		lastName: "",
		email: "",
		phone: "",
		status: "New",
		source: "General",
		tags: [],
		lastContactedAt: "",
	});

	const handleCreateLead = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formData.firstName || !formData.lastName || !formData.email) {
			toast.error("First Name, Last Name, and Email are required");
			return;
		}
		try {
			const res = await fetch("/api/leads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...formData,
					lastContactedAt: formData.lastContactedAt ? new Date(formData.lastContactedAt).toISOString() : null,
				}),
			});
			if (!res.ok) {
				const errorData = await res.json().catch(() => ({}));
				throw new Error(errorData.error || "Failed to create lead");
			}
			const newLead = await res.json();
			setLeads((prev) => [newLead, ...prev]);
			setIsCreateOpen(false);
			setFormData({
				firstName: "",
				lastName: "",
				email: "",
				phone: "",
				status: "New",
				source: "General",
				tags: [],
				lastContactedAt: "",
			});
			toast.success("Lead created successfully!");
		} catch (err: any) {
			toast.error(err.message || "Something went wrong");
		}
	};

	// -------------------- FETCH --------------------
	useEffect(() => {
		const fetchLeads = async () => {
			try {
				const res = await fetch("/api/leads");
				if (!res.ok) throw new Error("Failed to fetch leads");
				const json = await res.json();
				setLeads(json);
			} catch (err: any) {
				setError(err.message);
			} finally {
				setLoading(false);
			}
		};
		fetchLeads();
	}, []);

	// -------------------- FILTERS --------------------
	const filteredLeads = leads.filter((lead) => {
		const matchesSearch =
			lead.firstName
				?.toLowerCase()
				.includes(searchTerm.toLowerCase()) ||
			lead.lastName
				?.toLowerCase()
				.includes(searchTerm.toLowerCase()) ||
			lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			lead.phone?.includes(searchTerm);

		const matchesStatus =
			statusFilter === "all" ||
			lead.status?.toLowerCase() === statusFilter.toLowerCase();

		const matchesSource =
			sourceFilter === "All Sources" ||
			lead.source?.toLowerCase() === sourceFilter.toLowerCase();

		return matchesSearch && matchesStatus && matchesSource;
	});

	// -------------------- HELPERS --------------------
	const getStatusColor = (status: string) =>
		statusOptions.find((s) => s.value === status?.toLowerCase())
			?.color || "bg-gray-100 text-gray-800";

	const getSourceColor = (source: string) =>
		sourceOptions.find((s) => s.value === source)?.color ||
		"bg-gray-100 text-gray-800";

	// -------------------- UI STATES --------------------
	if (loading)
		return (
			<div className="p-6 text-center font-bold text-muted-foreground">
				Loading leads...
			</div>
		);
	if (error)
		return (
			<div className="p-6 text-center text-red-500">
				Error: {error}
			</div>
		);

	// -------------------- UI --------------------
	return (
		<div className="space-y-6">
			{/* HEADER */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold text-foreground">
						Leads
					</h1>
					<p className="text-muted-foreground mt-2">
						View, manage, and track all potential buyers and sellers
					</p>
				</div>
				<Button 
					onClick={() => setIsCreateOpen(true)}
					className="flex items-center gap-2"
				>
					<Plus className="h-4 w-4" />
					Add Lead
				</Button>
			</div>

			{/* SUMMARY CARDS */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				{[
					{
						label: "Total Leads",
						value: leads.length,
						color: "text-foreground",
					},
					{
						label: "New",
						value: leads.filter((l) => l.status === "New").length,
						color: "text-blue-600",
					},
					{
						label: "Interested",
						value: leads.filter((l) => l.status === "Interested")
							.length,
						color: "text-purple-600",
					},
					{
						label: "Closed",
						value: leads.filter((l) => l.status === "Closed").length,
						color: "text-green-600",
					},
				].map((card, i) => (
					<Card key={i}>
						<CardContent className="pt-6 text-center">
							<div className={`text-3xl font-bold ${card.color}`}>
								{card.value}
							</div>
							<p className="text-sm text-muted-foreground mt-1">
								{card.label}
							</p>
						</CardContent>
					</Card>
				))}
			</div>

			{/* LEADS TABLE */}
			<Card>
				<CardHeader>
					<CardTitle>All Leads</CardTitle>
					<CardDescription>
						Search, filter, and view all leads in one place
					</CardDescription>
				</CardHeader>
				<CardContent>
					{/* Filters */}
					<div className="flex flex-col md:flex-row gap-4 mb-4">
						<div className="flex-1 relative">
							<Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search by name, email, or phone..."
								className="pl-10"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
						</div>

						<Select
							value={statusFilter}
							onValueChange={(v) => setStatusFilter(v)}>
							<SelectTrigger className="md:w-48">
								<SelectValue placeholder="Filter by status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Statuses</SelectItem>
								{statusOptions.map((status) => (
									<SelectItem key={status.value} value={status.value}>
										{status.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select
							value={sourceFilter}
							onValueChange={(v) => setSourceFilter(v)}>
							<SelectTrigger className="md:w-48">
								<SelectValue placeholder="Filter by source" />
							</SelectTrigger>
							<SelectContent>
								{SourceFilters.map((src) => (
									<SelectItem key={src} value={src}>
										{src.replace("_", " ")}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Table */}
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border">
									{[
										"Name",
										"Contact",
										"Status",
										"Source",
										"Tags",
										"Last Contact",
										"Action",
									].map((head) => (
										<th
											key={head}
											className="text-left py-3 px-4 font-semibold text-foreground">
											{head}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{filteredLeads.map((lead, i) => (
									<tr
										key={i}
										className="border-b border-border hover:bg-muted/50 transition-colors">
										<td className="py-3 px-4 font-medium text-foreground">
											{lead.firstName} {lead.lastName}
										</td>
										<td className="py-3 px-4">
											<div className="space-y-1 text-xs text-muted-foreground">
												<div className="flex items-center gap-1">
													<Mail className="h-3 w-3" /> {lead.email}
												</div>
												<div className="flex items-center gap-1">
													<Phone className="h-3 w-3" /> {lead.phone}
												</div>
											</div>
										</td>
										<td className="py-3 px-4">
											<Badge className={getStatusColor(lead.status)}>
												{lead.status || "Unknown"}
											</Badge>
										</td>
										<td className="py-3 px-4">
											<Badge
												className={getSourceColor(lead.source || "")}>
												{lead.source?.replaceAll("_", " ") || "—"}
											</Badge>
										</td>
										<td className="py-3 px-4">
											<div className="flex gap-1 flex-wrap items-center">
												{lead.tags?.length ? (
													lead.tags.map((tag, j) => (
														<Badge
															key={j}
															variant="secondary"
															className="text-xs cursor-pointer"
															onClick={() => handleQuickTag(lead.id, String(tag), (lead.tags || []).map(String))}>
															{String(tag).replace(/_/g, " ")} ✕
														</Badge>
													))
												) : null}
												{/* Quick tag dropdown — show label only when no tags */}
												<div className="relative">
													<button
														onClick={() => setQuickTagLeadId(quickTagLeadId === lead.id ? null : lead.id)}
														className="text-xs text-muted-foreground hover:text-primary transition-colors px-1"
														title="Add / remove tags">
														{lead.tags?.length ? "+" : "+ Tag"}
													</button>
													{quickTagLeadId === lead.id && (
														<div className="absolute z-50 top-6 left-0 bg-background border rounded-lg shadow-lg p-2 min-w-[130px]">
															{TAG_OPTIONS.map((tag) => (
																<button
																	key={tag}
																	onClick={() => { handleQuickTag(lead.id, tag, (lead.tags || []).map(String)); setQuickTagLeadId(null); }}
																	className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors flex items-center gap-2 ${ (lead.tags || []).map(String).includes(tag) ? "font-semibold text-primary" : ""}`}>
																	{(lead.tags || []).map(String).includes(tag) ? "✓ " : ""}{tag}
																</button>
															))}
														</div>
													)}
												</div>
											</div>
										</td>
										<td className="py-3 px-4 text-xs text-muted-foreground">
											<div className="flex items-center gap-1">
												<Calendar className="h-3 w-3" />
												{lead.lastContactedAt
													? new Date(lead.lastContactedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
													: new Date(lead.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
											</div>
										</td>
										<td className="py-3 px-4">
											<div className="flex items-center gap-1">
												<Link href={`/admin/leads/${lead.id || lead._id}`} title="View">
													<Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
														<Eye className="h-4 w-4" />
													</Button>
												</Link>
												<Link href={`/admin/leads/${lead.id || lead._id}`} title="Edit">
													<Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
														<Edit className="h-4 w-4" />
													</Button>
												</Link>
												<Button 
													title="Delete"
													variant="ghost" 
													size="icon" 
													className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
													onClick={() => {
														if (confirm("Are you sure you want to delete this lead?")) {
															fetch(`/api/leads/${lead.id || lead._id}`, { method: "DELETE" })
																.then(res => {
																	if (res.ok) {
																		setLeads(prev => prev.filter(l => (l.id || l._id) !== (lead.id || lead._id)));
																		toast.success("Lead deleted");
																	} else {
																		toast.error("Failed to delete lead");
																	}
																});
														}
													}}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{filteredLeads.length === 0 && (
						<div className="text-center py-8">
							<p className="text-muted-foreground">
								No leads found matching your criteria.
							</p>
						</div>
					)}
				</CardContent>
			</Card>

			<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<DialogContent className="sm:max-w-[500px] w-[95vw] rounded-xl">
					<form onSubmit={handleCreateLead}>
						<DialogHeader>
							<DialogTitle>Add New Lead</DialogTitle>
							<DialogDescription>
								Fill in the details below to add a new potential lead.
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 py-4 max-h-[65vh] overflow-y-auto px-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
							<div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
								<Label htmlFor="firstName" className="text-left sm:text-right">
									First Name
								</Label>
								<Input
									id="firstName"
									required
									value={formData.firstName}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											firstName: e.target.value,
										}))
									}
									className="sm:col-span-3"
								/>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
								<Label htmlFor="lastName" className="text-left sm:text-right">
									Last Name
								</Label>
								<Input
									id="lastName"
									required
									value={formData.lastName}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											lastName: e.target.value,
										}))
									}
									className="sm:col-span-3"
								/>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
								<Label htmlFor="email" className="text-left sm:text-right">
									Email
								</Label>
								<Input
									id="email"
									type="email"
									required
									value={formData.email}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											email: e.target.value,
										}))
									}
									className="sm:col-span-3"
								/>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
								<Label htmlFor="phone" className="text-left sm:text-right">
									Phone
								</Label>
								<Input
									id="phone"
									value={formData.phone}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											phone: e.target.value,
										}))
									}
									className="sm:col-span-3"
								/>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
								<Label htmlFor="status" className="text-left sm:text-right">
									Status
								</Label>
								<Select
									value={formData.status}
									onValueChange={(v) =>
										setFormData((prev) => ({ ...prev, status: v }))
									}
								>
									<SelectTrigger className="sm:col-span-3">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="New">New</SelectItem>
										<SelectItem value="Contacted">Contacted</SelectItem>
										<SelectItem value="Interested">Interested</SelectItem>
										<SelectItem value="Closed">Closed</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
								<Label htmlFor="source" className="text-left sm:text-right">
									Source
								</Label>
								<Select
									value={formData.source}
									onValueChange={(v) =>
										setFormData((prev) => ({ ...prev, source: v }))
									}
								>
									<SelectTrigger className="sm:col-span-3">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="General">General</SelectItem>
										<SelectItem value="Signup">Signup</SelectItem>
										<SelectItem value="Contact_Form">Contact Form</SelectItem>
										<SelectItem value="Tour_Request">Tour Request</SelectItem>
										<SelectItem value="Home_Valuation">Home Valuation</SelectItem>
										<SelectItem value="Other">Other</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
								<Label className="text-left sm:text-right">Tags</Label>
								<div className="sm:col-span-3">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="outline" className="w-full justify-start text-left font-normal h-auto py-2 whitespace-normal min-h-10">
												{formData.tags.length > 0 
													? formData.tags.join(", ") 
													: "Select tags..."}
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent className="w-[85vw] sm:w-[325px]">
											{TAG_OPTIONS.map((tag) => {
												const isSelected = formData.tags.includes(tag);
												return (
													<DropdownMenuCheckboxItem
														key={tag}
														checked={isSelected}
														onCheckedChange={(checked) => {
															setFormData((prev) => ({
																...prev,
																tags: checked
																	? [...prev.tags, tag]
																	: prev.tags.filter((t) => t !== tag),
															}));
														}}
													>
														{tag}
													</DropdownMenuCheckboxItem>
												);
											})}
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
								<Label htmlFor="lastContactedAt" className="text-left sm:text-right">
									Last Contact
								</Label>
								<Input
									id="lastContactedAt"
									type="date"
									value={formData.lastContactedAt}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											lastContactedAt: e.target.value,
										}))
									}
									className="col-span-3"
								/>
							</div>
						</div>
						<DialogFooter>
							<Button type="submit">Create Lead</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
