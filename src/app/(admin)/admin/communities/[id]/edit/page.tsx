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
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import axios from "axios";
import UploadImg from "@/components/cloudinary/uploadImg";
import { useParams } from "next/navigation";
import { toast } from "sonner";

export default function EditCommunityPage() {
	const params = useParams<{ id: string }>();
	const [formData, setFormData] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchData = async () => {
			try {
				const id = params.id;
				const cname = decodeURIComponent(id).replaceAll(/-/g, " ");
				const res = await axios.get(`/api/community/${cname}`);
				setFormData(res.data.data);
			} catch (err) {
				console.error(err);
				setError("Failed to load community data.");
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [params.id]);

	const handleSave = async () => {
		try {
			const id = params.id;
			const res = await axios.put(`/api/community/${id}`, formData);
			setFormData(res.data.data);
			toast.success("Community updated successfully!");
		} catch (err) {
			console.error(err);
			setError("Failed to upload community data.");
		}
	};

	if (loading)
		return (
			<div className="p-6 text-center font-bold text-muted-foreground">
				Loading community data...
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
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button variant="outline" size="sm" asChild>
						<Link href="/admin/properties/communities">
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back to Communities
						</Link>
					</Button>
					<div>
						<h1 className="text-3xl font-bold text-foreground">
							Edit Community: {formData.name}
						</h1>
						<p className="text-muted-foreground">
							Update community information and marketing content
						</p>
					</div>
				</div>
				<Button onClick={handleSave}>
					<Save className="h-4 w-4 mr-2" />
					Save Changes
				</Button>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* LEFT SIDE */}
				<div className="lg:col-span-2 space-y-6">
					{/* Basic Info */}
					<Card>
						<CardHeader>
							<CardTitle>Basic Information</CardTitle>
							<CardDescription>
								Core community details and demographics
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<Label htmlFor="name">Community Name</Label>
									<Input
										id="name"
										disabled
										value={formData.name || ""}
										onChange={(e) =>
											setFormData({
												...formData,
												name: e.target.value,
											})
										}
									/>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* SEO Settings */}
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
									value={formData.title || ""}
									onChange={(e) =>
										setFormData({
											...formData,
											title: e.target.value,
										})
									}
									placeholder="SEO title for search results"
								/>
								<p className="text-xs text-muted-foreground mt-1">
									{formData.title?.length || 0}/60 characters
								</p>
							</div>
							<div>
								<Label htmlFor="metaDescription">
									Meta Description
								</Label>
								<Textarea
									id="metaDescription"
									rows={3}
									value={formData.metaDescription || ""}
									onChange={(e) =>
										setFormData({
											...formData,
											metaDescription: e.target.value,
										})
									}
									placeholder="SEO description for search results"
								/>
								<p className="text-xs text-muted-foreground mt-1">
									{formData.metaDescription?.length || 0}/160
									characters
								</p>
							</div>
							<div>
								<Label htmlFor="keywords">Keywords</Label>
								<Input
									id="keywords"
									value={formData.keywords || ""}
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

					{/* Description */}
					<Card>
						<CardHeader>
							<CardTitle>Content & Description</CardTitle>
							<CardDescription>
								Marketing content and community description
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Label htmlFor="infoText">Community Description</Label>
							<Textarea
								id="infoText"
								rows={4}
								value={formData.infoText || ""}
								onChange={(e) =>
									setFormData({
										...formData,
										infoText: e.target.value,
									})
								}
								placeholder="Describe the community's key features, attractions, and lifestyle..."
							/>
						</CardContent>
					</Card>
				</div>

				{/* RIGHT SIDE */}
				<div className="space-y-6">
					{/* Default Image */}
					<Card>
						<CardHeader>
							<CardTitle>Default Community Image</CardTitle>
							<CardDescription>
								Main image representing this community
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{formData.Images?.length > 0 && (
								<div className="aspect-video bg-muted rounded-lg overflow-hidden">
									<img
										src={formData.defaultImage || formData.Images[0]}
										alt={`${formData.name} image`}
										className="w-full h-full object-cover"
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

					{/* Stats */}
					<Card>
						<CardHeader>
							<CardTitle>Community Statistics</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex justify-between">
								<span className="text-sm text-muted-foreground">
									Total Properties
								</span>
								<span className="font-medium">
									{formData.PropertyCount ?? 0}
								</span>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
