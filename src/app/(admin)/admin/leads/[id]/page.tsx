"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	ArrowLeft,
	Mail,
	Phone,
	Calendar,
	MapPin,
	Plus,
	Trash2,
	Edit2,
	CheckSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import CityList from "@/data/cities";
import PropertyCriteria from "./criteriaCard";
import axios from "axios";

// -------------------- OPTIONS --------------------
const statusOptions = [
	{ value: "New", label: "New" },
	{ value: "Contacted", label: "Contacted" },
	{ value: "Interested", label: "Interested" },
	{ value: "Closed", label: "Closed" },
	{ value: "Trash", label: "Trash" },
];

const tagOptions = [
	"Buyer",
	"Seller",
	"Hot Lead",
	"Cold Lead",
	"Investor",
];

// -------------------- COMPONENT --------------------
export default function LeadProfilePage() {
	const { id } = useParams();
	const [lead, setLead] = useState<any | null>(null);
	const [loading, setLoading] = useState(true);
	const [noteLoading, setNoteLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [newNote, setNewNote] = useState("");
	const [selectedStatus, setSelectedStatus] = useState("");
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [editData, setEditData] = useState({
		firstName: "",
		lastName: "",
		email: "",
		phone: "",
		tags: [] as string[],
	});

	// Tasks State
	const [tasks, setTasks] = useState<any[]>([]);
	const [newTaskTitle, setNewTaskTitle] = useState("");
	const [newTaskDate, setNewTaskDate] = useState<Date | undefined>();
	const [taskLoading, setTaskLoading] = useState(false);

	// -------------------- FETCH LEAD --------------------
	useEffect(() => {
		if (!id) return;
		const fetchLead = async () => {
			try {
				const res = await fetch(`/api/leads/${id}`);
				if (!res.ok) throw new Error("Failed to fetch lead");
				const data = await res.json();
				setLead(data);
				setSelectedStatus(data.status || "");
				setSelectedTags(data.tags || []);
				setEditData({
					firstName: data.firstName || "",
					lastName: data.lastName || "",
					email: data.email || "",
					phone: data.phone || "",
					tags: data.tags || [],
				});
			} catch (err: any) {
				setError(err.message);
			} finally {
				setLoading(false);
			}
		};
		fetchLead();
		fetchTasks();
	}, [id]);

	const fetchTasks = async () => {
		try {
			const res = await fetch(`/api/leads/${id}/tasks`);
			if (res.ok) {
				const data = await res.json();
				setTasks(data);
			}
		} catch (error) {
			console.error("Failed to fetch tasks:", error);
		}
	};

	const handleAddTask = async () => {
		if (!newTaskTitle.trim()) return toast.error("Task title cannot be empty");
		try {
			setTaskLoading(true);
			const res = await fetch(`/api/leads/${id}/tasks`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: newTaskTitle, dueDate: newTaskDate }),
			});
			if (!res.ok) throw new Error("Failed to add task");
			setNewTaskTitle("");
			setNewTaskDate(undefined);
			fetchTasks();
			toast.success("Task Added!");
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			setTaskLoading(false);
		}
	};

	const handleToggleTask = async (taskId: string, currentStatus: string) => {
		try {
			const newStatus = currentStatus === "completed" ? "pending" : "completed";
			await fetch(`/api/leads/${id}/tasks/${taskId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: newStatus }),
			});
			fetchTasks();
		} catch (err: any) {
			toast.error("Failed to update task");
		}
	};

	const handleDeleteTask = async (taskId: string) => {
		try {
			await fetch(`/api/leads/${id}/tasks/${taskId}`, { method: "DELETE" });
			fetchTasks();
			toast.success("Task Removed");
		} catch (err: any) {
			toast.error("Failed to delete task");
		}
	};

	// -------------------- HANDLE ADD NOTE --------------------
	const handleAddNote = async () => {
		if (!newNote.trim()) return alert("Note cannot be empty");
		try {
			setNoteLoading(true);
			const res = await fetch(`/api/leads/${id}/notes`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: newNote }),
			});
			if (!res.ok) throw new Error("Failed to add note");
			const updated = await res.json();
			setLead(updated);
			setNewNote("");
			setNoteLoading(false);
			toast.success("Note Added!");
		} catch (err: any) {
			toast.error(err.message);
			setNoteLoading(false);
		}
	};

	// -------------------- HANDLE DELETE NOTE --------------------
	const handleDeleteNote = async (noteId: string) => {
		try {
			const res = await fetch(`/api/leads/${id}/notes/${noteId}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Failed to delete note");
			const updated = await res.json();
			setLead(updated);
			toast.success("Note Removed!");
		} catch (err: any) {
			toast.error(err.message);
		}
	};

	// -------------------- HANDLE TAG TOGGLE --------------------
	const handleTagToggle = (tag: string) => {
		setSelectedTags((prev) =>
			prev.includes(tag)
				? prev.filter((t) => t !== tag)
				: [...prev, tag]
		);
	};

	// -------------------- HANDLE SAVE STATUS & TAGS --------------------
	const handleSaveChanges = async () => {
		try {
			const res = await fetch(`/api/leads/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					status: selectedStatus,
					tags: selectedTags,
				}),
			});
			if (!res.ok) throw new Error("Failed to update lead");
			const updated = await res.json();
			setLead(updated);
			toast.success("Lead updated successfully!");
		} catch (err: any) {
			toast.error(err.message);
		}
	};
	const refreshLead = async () => {
		try {
			const res = await axios.get(`/api/leads/${id}`);
			setLead(res.data);
			setEditData({
				firstName: res.data.firstName || "",
				lastName: res.data.lastName || "",
				email: res.data.email || "",
				phone: res.data.phone || "",
				tags: res.data.tags || [],
			});
			setSelectedTags(res.data.tags || []);
		} catch (err) {
			console.error("Failed to refresh lead:", err);
		}
	};

	const handleUpdateProfile = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const res = await fetch(`/api/leads/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...editData,
					fullName: `${editData.firstName} ${editData.lastName}`.trim(),
				}),
			});
			if (!res.ok) throw new Error("Failed to update profile");
			const updated = await res.json();
			setLead(updated);
			setSelectedTags(updated.tags || []);
			setIsEditModalOpen(false);
			toast.success("Profile updated successfully!");
		} catch (err: any) {
			toast.error(err.message);
		}
	};

	// -------------------- HANDLE ADD CRITERIA --------------------
	const handleAddCriteria = async (
		e: React.FormEvent<HTMLFormElement>
	) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const criteria = Object.fromEntries(formData.entries());
		try {
			const res = await fetch(`/api/leads/${id}/criteria`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(criteria),
			});
			if (!res.ok) throw new Error("Failed to add property criteria");
			const updated = await res.json();
			setLead(updated);
			e.currentTarget.reset();
		} catch (err: any) {
			toast.error(err.message);
		}
	};
	const handleDeleteCriteria = async (criteriaId: string) => {
		try {
			const res = await fetch(
				`/api/leads/${id}/criteria/${criteriaId}`,
				{
					method: "DELETE",
				}
			);
			if (!res.ok) throw new Error("Failed to delete criteria");
			const updated = await res.json();
			setLead(updated);
			toast.success("Criteria Removed!");
		} catch (err: any) {
			toast.error(err.message);
		}
	};

	const getScoreColor = (label: string) => {
		switch (label) {
			case "Ready to Buy": return "bg-red-100 text-red-800 font-bold border-red-200";
			case "Hot": return "bg-orange-100 text-orange-800";
			case "Warm": return "bg-amber-100 text-amber-800";
			case "Cold": return "bg-blue-100 text-blue-800";
			default: return "bg-gray-100 text-gray-800";
		}
	};

	if (loading)
		return (
			<div className="p-6 text-center text-muted-foreground">
				Loading lead details...
			</div>
		);
	if (error)
		return (
			<div className="p-6 text-center text-red-500">
				Error: {error}
			</div>
		);
	if (!lead)
		return (
			<div className="p-6 text-center text-muted-foreground">
				No details available.
			</div>
		);

	// -------------------- UI --------------------
	return (
		<div className="space-y-6">
			{/* HEADER */}
			<div className="flex items-center justify-between gap-4">
				<Link href="/admin/leads">
					<Button
						variant="outline"
						size="sm"
						className="flex items-center gap-2">
						<ArrowLeft className="h-4 w-4" /> Back
					</Button>
				</Link>
				<div>
					<h1 className="text-lg font-bold">
						{lead.firstName} {lead.lastName}
					</h1>
					<p className="text-muted-foreground">Lead Profile</p>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* LEFT SIDE */}
				<div className="lg:col-span-2 space-y-6">
					{/* Lead Info */}
					<Card>
						<CardHeader className="flex flex-row items-start justify-between pb-2">
							<div>
								<CardTitle>Lead Information</CardTitle>
								<CardDescription>
									Contact details & inquiry info
								</CardDescription>
							</div>
							<Button variant="ghost" size="sm" onClick={() => setIsEditModalOpen(true)}>
								<Edit2 className="h-4 w-4 mr-1" /> Edit
							</Button>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{[
									{ label: "Email", value: <span>{lead.email}</span>, icon: Mail },
									{ label: "Phone", value: <span>{lead.phone}</span>, icon: Phone },
									{ label: "Source", value: <span>{lead.source}</span> },
									{ 
										label: "Score", 
										value: (
											<Badge className={getScoreColor(lead.scoreLabel)}>
												{lead.scoreLabel || "Cold"} ({lead.score || 0} pts)
											</Badge>
										)
									},
									{
										label: "Created",
										value: <span>{new Date(lead.createdAt).toLocaleString()}</span>,
										icon: Calendar,
									},
									{
										label: "Tags",
										value: lead.tags?.length ? (
											<div className="flex gap-1.5 flex-wrap mt-0.5">
												{lead.tags.map((tag: string) => (
													<Badge key={tag} className="text-xs px-2 py-0.5 font-semibold bg-[#d90429]/10 text-[#d90429] border-0 hover:bg-[#d90429]/10">
														{tag}
													</Badge>
												))}
											</div>
										) : (
											<span className="text-muted-foreground text-xs italic">No tags</span>
										)
									}
								].map((f) => (
									<div key={f.label}>
										<Label className="text-xs text-muted-foreground">
											{f.label}
										</Label>
										<div className="flex items-center gap-2 mt-1">
											{f.icon && (
												<f.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
											)}
											<div className="text-sm font-medium text-foreground">{f.value || "—"}</div>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					<PropertyCriteria lead={lead} refreshLead={refreshLead} />

					<Card>
						<CardHeader>
							<CardTitle>Inquiry History</CardTitle>
							<CardDescription>
								All property inquiries from this lead
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								{lead.inquiryHistory?.length ? (
									lead.inquiryHistory.map((inquiry: any) => {
										const isValuation = inquiry.type === "Home_Valuation";
										const isTour = inquiry.type === "Tour_Request";
										return (
											<div
												key={inquiry._id || inquiry.id}
												className={`p-4 rounded-xl border ${
													isValuation
														? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200"
														: isTour
														? "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200"
														: "bg-card border-border"
												}`}
											>
												<div className="flex flex-col gap-2">
													<div className="flex items-center justify-between">
														{isValuation ? (
															<Badge className="bg-amber-600 text-white font-bold text-xs gap-1">
																🏠 SELLER — HOME VALUATION ESTIMATE
															</Badge>
														) : isTour ? (
															<Badge className="bg-blue-600 text-white font-bold text-xs gap-1">
																🛒 BUYER — TOUR BOOKING REQUEST
															</Badge>
														) : (
															<Badge variant="outline" className="text-xs font-semibold uppercase tracking-wider">
																💬 {String(inquiry.type).replaceAll("_", " ")}
															</Badge>
														)}
														<span className="text-xs text-muted-foreground font-medium">
															{new Date(inquiry.createdAt).toLocaleString()}
														</span>
													</div>
													{inquiry.message && (
														<p className="text-xs text-gray-800 dark:text-gray-200 bg-white/80 dark:bg-zinc-900/80 p-3 rounded-lg border border-border whitespace-pre-wrap leading-relaxed font-mono">
															{inquiry.message}
														</p>
													)}
												</div>
											</div>
										);
									})
								) : (
									<p className="text-sm text-muted-foreground">
										No inquiries yet.
									</p>
								)}

							</div>
						</CardContent>
					</Card>

					{/* LEAD TIMELINE */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-primary"/> Contact Timeline & AI History</CardTitle>
							<CardDescription>
								Live feed of properties viewed, searches, and AI chats.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								
								{/* AI Chats */}
								{lead.aiChats?.length > 0 && (
									<div className="space-y-2">
										<h4 className="text-sm font-semibold text-gray-500 uppercase">AI Conversations</h4>
										{lead.aiChats.map((chat: any) => (
											<div key={chat.id} className={`p-3 text-sm rounded-lg border ${chat.role === 'ai' ? 'bg-primary/10 border-primary/20 ml-6' : 'bg-gray-50 border-gray-200 mr-6'}`}>
												<div className="flex justify-between items-center mb-1">
													<span className="font-bold text-xs capitalize">{chat.role === 'ai' ? '🤖 AI Assistant' : '👤 Lead'} ({chat.channel})</span>
													<span className="text-xs text-gray-400">{new Date(chat.createdAt).toLocaleString()}</span>
												</div>
												<p className="text-gray-700 whitespace-pre-wrap">{chat.message}</p>
											</div>
										))}
									</div>
								)}

								{/* Viewed Properties */}
								{lead.viewHistory?.length > 0 && (
									<div className="space-y-2 mt-6">
										<h4 className="text-sm font-semibold text-gray-500 uppercase">Properties Viewed</h4>
										{lead.viewHistory.map((view: any) => (
											<div key={view._id} className="flex justify-between items-center p-3 text-sm bg-blue-50 border border-blue-100 rounded-lg">
												<div>
													<Link href={`/properties/${view.propertyId}`} target="_blank" className="font-semibold text-blue-700 hover:underline">{view.address}</Link>
													<p className="text-xs text-blue-600 mt-0.5">Price: {view.price ? `$${view.price.toLocaleString()}` : "N/A"}</p>
												</div>
												<div className="text-right">
													<Badge variant="outline" className="bg-white text-xs">Viewed {view.viewCount} times</Badge>
													<p className="text-[10px] text-gray-500 mt-1">Last: {new Date(view.lastViewedAt).toLocaleDateString()}</p>
												</div>
											</div>
										))}
									</div>
								)}

								{(!lead.aiChats?.length && !lead.viewHistory?.length) && (
									<p className="text-sm text-muted-foreground text-center py-4">No timeline activity yet.</p>
								)}

							</div>
						</CardContent>
					</Card>
				</div>

				{/* RIGHT SIDE */}
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>Status & Tags</CardTitle>
							<CardDescription>
								Manage status and categorization
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{/* Status */}
							<div>
								<Label>Status</Label>
								<Select
									value={selectedStatus}
									onValueChange={setSelectedStatus}>
									<SelectTrigger>
										<SelectValue placeholder="Select status" />
									</SelectTrigger>
									<SelectContent>
										{statusOptions.map((s) => (
											<SelectItem key={s.value} value={s.value}>
												{s.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Tags */}
							<div className="space-y-2">
								<Label>Tags</Label>
								<div className="space-y-1">
									{tagOptions.map((tag) => (
										<div
											key={tag}
											className="flex items-center gap-2">
											<input
												type="checkbox"
												checked={selectedTags.includes(tag)}
												onChange={() => handleTagToggle(tag)}
											/>
											<Label className="cursor-pointer">{tag}</Label>
										</div>
									))}
								</div>
							</div>

											<Button className="w-full" onClick={handleSaveChanges}>
								Save Changes
							</Button>
						</CardContent>
					</Card>

					{/* TASKS SYSTEM */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2"><CheckSquare className="w-5 h-5 text-primary"/> Tasks & Reminders</CardTitle>
							<CardDescription>
								To-do list for this lead
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Input 
									placeholder="New task title (e.g. Call tomorrow)" 
									value={newTaskTitle} 
									onChange={(e) => setNewTaskTitle(e.target.value)} 
								/>
								<Button className="w-full" onClick={handleAddTask} disabled={taskLoading || !newTaskTitle.trim()}>
									{taskLoading ? "Adding..." : "Add Task"}
								</Button>
							</div>

							<div className="space-y-2 mt-4">
								{tasks.length > 0 ? tasks.map((task: any) => (
									<div key={task.id} className={`flex items-start justify-between p-3 border rounded-lg ${task.status === 'completed' ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200'}`}>
										<div className="flex items-start gap-3">
											<input 
												type="checkbox" 
												className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
												checked={task.status === "completed"}
												onChange={() => handleToggleTask(task.id, task.status)}
											/>
											<div>
												<p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-foreground'}`}>
													{task.title}
												</p>
												<span className="text-[10px] text-muted-foreground">{new Date(task.createdAt).toLocaleDateString()}</span>
											</div>
										</div>
										<button onClick={() => handleDeleteTask(task.id)} className="text-gray-400 hover:text-red-500 transition-colors">
											<Trash2 className="h-4 w-4" />
										</button>
									</div>
								)) : (
									<p className="text-xs text-muted-foreground text-center py-2">No tasks yet.</p>
								)}
							</div>
						</CardContent>
					</Card>

					{/* Notes */}
					<Card>
						<CardHeader>
							<CardTitle>Notes</CardTitle>
							<CardDescription>
								Add and manage lead notes
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Textarea
									placeholder="Add a note..."
									value={newNote}
									onChange={(e) => setNewNote(e.target.value)}
									className="min-h-[80px]"
								/>
								<Button
									onClick={handleAddNote}
									disabled={noteLoading}
									className="w-full flex items-center gap-2">
									<Plus className="h-4 w-4" /> Add Note
								</Button>
							</div>

							<div className="space-y-3 pt-4 border-t border-border">
								{lead.notes?.length ? (
									lead.notes.map((note: any) => (
										<div
											key={note._id}
											className="p-3 bg-muted/50 rounded-lg">
											<div className="flex items-start justify-between">
												<div>
													<p>{note.content}</p>
													<p className="text-xs text-muted-foreground mt-2">
														{new Date(
															note.createdAt
														).toLocaleString()}
													</p>
												</div>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => handleDeleteNote(note._id)}
													className="text-destructive hover:text-destructive">
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</div>
									))
								) : (
									<p className="text-sm text-muted-foreground">
										No notes yet.
									</p>
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			<Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
				<DialogContent className="sm:max-w-[425px]">
					<form onSubmit={handleUpdateProfile}>
						<DialogHeader>
							<DialogTitle>Edit Lead Details</DialogTitle>
						</DialogHeader>
						<div className="grid gap-4 py-4">
							<div className="space-y-2">
								<Label htmlFor="firstName">First Name</Label>
								<Input
									id="firstName"
									value={editData.firstName}
									onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="lastName">Last Name</Label>
								<Input
									id="lastName"
									value={editData.lastName}
									onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									value={editData.email}
									onChange={(e) => setEditData({ ...editData, email: e.target.value })}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="phone">Phone</Label>
								<Input
									id="phone"
									value={editData.phone}
									onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
								/>
							</div>
							<div className="space-y-2">
								<Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Tags</Label>
								<div className="flex gap-4 flex-wrap mt-1 p-2 bg-muted/30 rounded-lg border border-border/50">
									{tagOptions.map((tag) => (
										<div key={tag} className="flex items-center gap-2">
											<input
												type="checkbox"
												id={`modal-tag-${tag}`}
												checked={editData.tags.includes(tag)}
												onChange={() => {
													setEditData(prev => ({
														...prev,
														tags: prev.tags.includes(tag)
															? prev.tags.filter((t) => t !== tag)
															: [...prev.tags, tag],
													}));
												}}
												className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
											/>
											<label htmlFor={`modal-tag-${tag}`} className="text-sm font-medium leading-none cursor-pointer text-gray-700">
												{tag}
											</label>
										</div>
									))}
								</div>
							</div>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
							<Button type="submit">Save Changes</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

		</div>
	);
}
