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
import { ArrowLeft, Save, Video } from "lucide-react";
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
	const [generatingAi, setGeneratingAi] = useState(false);

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

	const getEmbedUrl = (url: string) => {
		if (!url) return null;
		let videoId = "";
		if (url.includes("youtube.com/watch?v=")) {
			videoId = url.split("watch?v=")[1].split("&")[0];
		} else if (url.includes("youtu.be/")) {
			videoId = url.split("youtu.be/")[1].split("?")[0];
		}
		
		if (videoId) {
			return `https://www.youtube.com/embed/${videoId}`;
		}
		
		if (url.includes("vimeo.com/")) {
			const vimeoId = url.split("vimeo.com/")[1].split("?")[0];
			if (vimeoId && !isNaN(Number(vimeoId))) {
				return `https://player.vimeo.com/video/${vimeoId}`;
			}
		}
		
		return url;
	};

	const handleGenerateAi = async () => {
		try {
			setGeneratingAi(true);
			const res = await axios.post(`/api/admin/generate-community-ai`, {
				communityId: formData.id,
				isGolfCommunity: formData.isGolfCommunity || false
			});
			if (res.data.success) {
				setFormData({
					...formData,
					infoText: res.data.community.description,
					description: res.data.community.description
				});
				toast.success("AI Description generated successfully!");
			}
		} catch (err) {
			console.error(err);
			toast.error("Failed to generate AI description.");
		} finally {
			setGeneratingAi(false);
		}
	};

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
						<CardHeader className="flex flex-row items-center justify-between">
							<div>
								<CardTitle>Content & Description</CardTitle>
								<CardDescription>
									Marketing content and community description
								</CardDescription>
							</div>
							<div className="flex items-center gap-4">
								<div className="flex items-center space-x-2">
									<input 
										type="checkbox" 
										id="isGolfCommunity" 
										checked={formData.isGolfCommunity || false}
										onChange={(e) => setFormData({ ...formData, isGolfCommunity: e.target.checked })}
										className="w-4 h-4"
									/>
									<Label htmlFor="isGolfCommunity" className="text-sm">Is Golf Community?</Label>
								</div>
								<Button 
									variant="secondary" 
									onClick={handleGenerateAi} 
									disabled={generatingAi}
								>
									{generatingAi ? "Generating..." : "Generate AI Description"}
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<Label htmlFor="infoText">Community Description (HTML)</Label>
							<Textarea
								id="infoText"
								rows={12}
								value={formData.infoText || formData.description || ""}
								onChange={(e) =>
									setFormData({
										...formData,
										infoText: e.target.value,
										description: e.target.value
									})
								}
								placeholder="Describe the community's key features, attractions, and lifestyle... Use HTML tags."
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

					{/* Video */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Video className="w-5 h-5" />
								Community Video
							</CardTitle>
							<CardDescription>
								Embed a promotional video for the community
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<Label htmlFor="videoUrl">Video URL</Label>
								<Input
									id="videoUrl"
									placeholder="Paste YouTube or Vimeo URL..."
									value={formData.videoUrl || ""}
									onChange={(e) =>
										setFormData({
											...formData,
											videoUrl: e.target.value,
										})
									}
								/>
								<p className="text-xs text-muted-foreground mt-2">
									Paste a YouTube or Vimeo URL to embed a video on the community page
								</p>
							</div>

							{formData.videoUrl && (
								<div className="aspect-video bg-muted rounded-lg overflow-hidden relative">
									<iframe
										src={getEmbedUrl(formData.videoUrl) || formData.videoUrl}
										className="absolute top-0 left-0 w-full h-full"
										allowFullScreen
										title="Community Video Preview"
									></iframe>
								</div>
							)}
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
