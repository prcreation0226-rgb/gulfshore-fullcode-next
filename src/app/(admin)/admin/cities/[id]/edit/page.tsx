"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, Save, Eye } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import axios from "axios";
import UploadImg from "@/components/cloudinary/uploadImg";
import { toast } from "sonner";
import { useParams } from "next/navigation";

export default function EditCityPage() {
	const params = useParams<{ id: string }>();
	const [formData, setFormData] = useState<any>();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		const fetchData = async () => {
			const id = params.id;
			try {
				const city = await axios.get(`/api/cities/${id}`);

				setFormData(city.data.data);
				console.log(city.data.data);
			} catch (error) {
				setError("Failed to load city data.");
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, []);

	const handleSave = async () => {
		try {
			const id = params.id;
			const res = await axios.put(`/api/cities/${id}`, formData);
			setFormData(res.data.data);
			toast.success("City updated successfully!");
		} catch (error) {
			setError("Failed to upload city data.");
		}
	};

	if (loading)
		return (
			<div className="p-6 text-center font-bold text-muted-foreground">
				Loading requests...
			</div>
		);
	if (error)
		return (
			<div className="p-6 text-center text-red-500">
				Error: {error}
			</div>
		);

	if (!formData)
		return (
			<div className="p-6 text-center font-bold text-muted-foreground">
				No Data available.
			</div>
		);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button variant="outline" size="sm" asChild>
						<Link href="/admin/properties/cities">
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back to Cities
						</Link>
					</Button>
					<div>
						<h1 className="text-3xl font-bold text-foreground">
							Edit City: {formData.name}
						</h1>
						<p className="text-muted-foreground">
							Update city information and marketing content
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					<Button onClick={handleSave}>
						<Save className="h-4 w-4 mr-2" />
						Save Changes
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Main Content */}
				<div className="lg:col-span-2 space-y-6">
					{/* Basic Information */}
					<Card>
						<CardHeader>
							<CardTitle>Basic Information</CardTitle>
							<CardDescription>
								Core city details and demographics
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<Label htmlFor="name">City Name</Label>
									<Input
										id="name"
										disabled
										value={formData.name}
										onChange={(e) => {
											setFormData({
												...formData,
												name: e.target.value,
											});
											console.log(formData);
										}}
									/>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>SEO Settings</CardTitle>
							<CardDescription>
								Search engine optimization settings
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<Label htmlFor="title">Meta Title</Label>
								<Input
									id="title"
									value={formData.title}
									onChange={(e) =>
										setFormData({
											...formData,
											title: e.target.value,
										})
									}
									placeholder="SEO title for search results"
								/>
								<p className="text-xs text-muted-foreground mt-1">
									{formData.title?.length}/60 characters
								</p>
							</div>
							<div>
								<Label htmlFor="metaDescription">
									Meta Description
								</Label>
								<Textarea
									id="metaDescription"
									rows={3}
									value={formData.metaDescription}
									onChange={(e) =>
										setFormData({
											...formData,
											metaDescription: e.target.value,
										})
									}
									placeholder="SEO description for search results"
								/>
								<p className="text-xs text-muted-foreground mt-1">
									{formData.metaDescription?.length}/160 characters
								</p>
							</div>
							<div>
								<Label htmlFor="keywords">Keywords</Label>
								<Input
									id="keywords"
									value={formData.keywords}
									onChange={(e) =>
										setFormData({
											...formData,
											keywords: e.target.value,
										})
									}
									placeholder="Comma-separated keywords"
								/>
							</div>
						</CardContent>
					</Card>

					{/* Content & Description */}
					<Card>
						<CardHeader>
							<CardTitle>Content & Description</CardTitle>
							<CardDescription>
								Marketing content and city description
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<Label htmlFor="infoText">City Description</Label>
								<Textarea
									id="infoText"
									rows={4}
									value={formData.infoText}
									onChange={(e) =>
										setFormData({
											...formData,
											infoText: e.target.value,
										})
									}
									placeholder="Describe the city's key features, attractions, and lifestyle..."
								/>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Sidebar */}
				<div className="space-y-6">
					{/* Status */}
					<Card>
						<CardHeader>
							<CardTitle>Publication Status</CardTitle>
						</CardHeader>
						<CardContent>
							<Select
								value={formData.status}
								onValueChange={(value) =>
									setFormData({
										...formData,
										status: value === "true" ? true : false,
									})
								}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="true">Featured</SelectItem>
									<SelectItem value="false">Standard</SelectItem>
								</SelectContent>
							</Select>
							<div className="mt-2">
								<Badge
									variant={
										formData.featured === true
											? "default"
											: "secondary"
									}>
									{formData.featured === true
										? "Featured City"
										: "Standard City"}
								</Badge>
							</div>
						</CardContent>
					</Card>

					{/* Default Image */}
					<Card>
						<CardHeader>
							<CardTitle>Default City Image</CardTitle>
							<CardDescription>
								Main image representing this city
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{formData.Images.length && (
								<div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
									<img
										src={formData.defaultImage || formData.Images[0]}
										alt={`${formData.name} skyline`}
										className="w-full h-full object-cover rounded-lg"
									/>
								</div>
							)}

							<UploadImg
								formData={formData}
								setFormData={setFormData}
							/>
							<p className="text-xs text-muted-foreground">
								Recommended: 1200x600px, JPG or PNG format
							</p>
						</CardContent>
					</Card>

					{/* Statistics */}
					<Card>
						<CardHeader>
							<CardTitle>City Statistics</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="flex justify-between">
								<span className="text-sm text-muted-foreground">
									Total Properties
								</span>
								<span className="font-medium">
									{formData.PropertyCount}
								</span>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
