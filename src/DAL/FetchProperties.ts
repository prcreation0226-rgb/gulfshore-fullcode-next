import axios from "axios";
import { redirect } from "next/navigation";

export default async function FetchProperties(params: string[]) {
	const paramsString = params.join("&");
	try {
		const response = await axios.get(
			`/api/properties?${paramsString}`
		);
		if (response.data.success) {
			return response.data;
		}
	} catch (error) {
		return;
	}
}

export async function FetchProperty(params: string) {
	const slug = decodeURIComponent(params);
	try {
		const baseUrl = typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_SERVER_URL || "https://gulfshoregroup.com") : "";

		const res = await fetch(`${baseUrl}/api/v2/properties/${slug}`, {
			method: "GET",
		});
		const response = await res.json();

		if (response.success) {
			return response.data;
		}
	} catch (error) {
		const url = typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_SERVER_URL || "https://gulfshoregroup.com") : "";
		return redirect(`${url}/Florida-Real-Estate-Search`);
	}
}
