import prisma from "@/lib/prisma";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Bot, User, Clock, Smartphone, Mail, Globe } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AIChatsPage() {
	// Fetch all chat history, grouped or sorted
	// Let's get the 100 most recent messages, including the lead details
	const chats = await prisma.aIChatHistory.findMany({
		orderBy: { createdAt: "desc" },
		take: 100,
		include: {
			lead: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					phone: true,
				}
			}
		}
	});

	// Group them by Lead ID to show conversation threads
	const groupedChats = chats.reduce((acc: any, chat: any) => {
		if (!acc[chat.leadId]) {
			acc[chat.leadId] = {
				lead: chat.lead,
				messages: []
			};
		}
		acc[chat.leadId].messages.push(chat);
		return acc;
	}, {});

	const leadIds = Object.keys(groupedChats);

	return (
		<div className="space-y-6 p-4 max-w-7xl mx-auto">
			<div>
				<h1 className="text-3xl font-bold flex items-center gap-2">
					<Bot className="w-8 h-8 text-primary" /> AI Conversations
				</h1>
				<p className="text-muted-foreground mt-1">
					Track all recent AI interactions via Website Chat, SMS, and Email.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-6">
				{leadIds.length === 0 ? (
					<Card>
						<CardContent className="p-8 text-center text-muted-foreground">
							No AI conversations found yet.
						</CardContent>
					</Card>
				) : (
					leadIds.map((leadId) => {
						const thread = groupedChats[leadId];
						// Reverse to show oldest first in the thread view
						const messages = [...thread.messages].reverse(); 
						const lastActivity = thread.messages[0].createdAt;
						const channelIcon = (channel: string) => {
							if (channel === 'sms') return <Smartphone className="w-4 h-4 text-blue-500" />;
							if (channel === 'email') return <Mail className="w-4 h-4 text-orange-500" />;
							return <Globe className="w-4 h-4 text-green-500" />;
						};

						return (
							<Card key={leadId} className="overflow-hidden border-border/80 shadow-sm">
								<CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
									<div className="flex justify-between items-start">
										<div>
											<CardTitle className="text-lg font-bold flex items-center gap-2">
												<User className="w-5 h-5 text-gray-500" /> 
												{thread.lead.firstName ? `${thread.lead.firstName} ${thread.lead.lastName || ""}` : (thread.lead.email || thread.lead.phone)}
											</CardTitle>
											<CardDescription className="mt-1 flex gap-3 text-xs font-medium">
												{thread.lead.email && <span>{thread.lead.email}</span>}
												{thread.lead.phone && <span>{thread.lead.phone}</span>}
											</CardDescription>
										</div>
										<div className="text-right">
											<div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
												<Clock className="w-3 h-3" /> Last Active: {new Date(lastActivity).toLocaleString()}
											</div>
											<Link 
												href={`/admin/leads/${leadId}`}
												className="text-xs bg-primary/10 text-primary hover:bg-primary hover:text-white px-3 py-1.5 rounded-full transition-colors font-semibold"
											>
												View Full Profile
											</Link>
										</div>
									</div>
								</CardHeader>
								<CardContent className="p-0">
									<div className="max-h-[400px] overflow-y-auto p-4 space-y-4 bg-gray-50/50">
										{messages.map((chat: any) => (
											<div key={chat.id} className={`flex flex-col ${chat.role === 'ai' ? 'items-end' : 'items-start'}`}>
												<div className="flex items-center gap-1.5 mb-1 px-1">
													{chat.role === 'user' ? (
														<>
															<span className="text-[10px] font-bold text-gray-500 uppercase">{chat.role}</span>
															{channelIcon(chat.channel)}
														</>
													) : (
														<>
															<Bot className="w-3.5 h-3.5 text-primary" />
															<span className="text-[10px] font-bold text-primary uppercase">AI Assistant</span>
														</>
													)}
												</div>
												<div 
													className={`max-w-[85%] text-sm p-3 rounded-2xl shadow-sm whitespace-pre-wrap leading-relaxed ${
														chat.role === 'ai' 
														? 'bg-primary text-white rounded-tr-sm' 
														: 'bg-white border border-border/60 text-gray-800 rounded-tl-sm'
													}`}
												>
													{chat.message}
												</div>
												<span className="text-[10px] text-gray-400 mt-1 px-2">
													{new Date(chat.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
												</span>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						);
					})
				)}
			</div>
		</div>
	);
}
