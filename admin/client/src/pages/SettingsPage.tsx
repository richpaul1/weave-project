import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  MessageSquare,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";

// Chat settings schema
const chatSettingsSchema = z.object({
  chat_service_prompt: z.string().min(10, "Please enter a valid prompt"),
  search_score_threshold: z.number().min(0.5, "Threshold must be at least 0.5").max(1.0, "Threshold must be at most 1.0"),
  enable_title_matching: z.boolean(),
  enable_full_page_content: z.boolean(),
  max_pages: z.number().min(1, "Must be at least 1").max(20, "Must be at most 20"),
  empty_search_default_response: z.string().min(10, "Please enter a valid default response"),
  enable_full_validation_testing: z.boolean(),
});

type ChatSettingsFormData = z.infer<typeof chatSettingsSchema>;

interface ChatSettings {
  chat_service_prompt: string;
  search_score_threshold: number;
  enable_title_matching: boolean;
  enable_full_page_content: boolean;
  max_pages: number;
  empty_search_default_response: string;
  enable_full_validation_testing: boolean;
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// API functions
const fetchChatSettings = async (): Promise<ChatSettings> => {
  const response = await fetch('/api/settings/chat');
  if (!response.ok) {
    throw new Error('Failed to fetch chat settings');
  }
  const result: ApiResponse<ChatSettings> = await response.json();
  if (result.error) {
    throw new Error(result.error);
  }
  return result.data!;
};

const updateChatSettings = async (settings: ChatSettings): Promise<ChatSettings> => {
  const response = await fetch('/api/settings/chat', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update chat settings');
  }
  
  const result: ApiResponse<ChatSettings> = await response.json();
  if (result.error) {
    throw new Error(result.error);
  }
  return result.data!;
};

const resetChatSettings = async (): Promise<ChatSettings> => {
  const response = await fetch('/api/settings/chat/reset', {
    method: 'POST',
  });
  
  if (!response.ok) {
    throw new Error('Failed to reset chat settings');
  }
  
  const result: ApiResponse<ChatSettings> = await response.json();
  if (result.error) {
    throw new Error(result.error);
  }
  return result.data!;
};

export default function SettingsPage() {
  const queryClient = useQueryClient();

  // Fetch current settings
  const { data: chatSettings, isLoading, error } = useQuery({
    queryKey: ['chatSettings'],
    queryFn: fetchChatSettings,
  });

  // Chat settings form
  const chatForm = useForm<ChatSettingsFormData>({
    resolver: zodResolver(chatSettingsSchema),
    defaultValues: {
      chat_service_prompt: "",
      search_score_threshold: 0.9,
      enable_title_matching: true,
      enable_full_page_content: true,
      max_pages: 5,
      empty_search_default_response: "I apologize, but I couldn't find any relevant information in the knowledge base to answer your question. Please try rephrasing your question or asking about a different topic that might be covered in the available documentation.",
      enable_full_validation_testing: false,
    },
  });

  // Update form when data is loaded
  React.useEffect(() => {
    if (chatSettings) {
      chatForm.reset(chatSettings);
    }
  }, [chatSettings, chatForm]);

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: updateChatSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['chatSettings'], data);
      toast.success("Settings updated successfully!");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update settings: ${error.message}`);
    },
  });

  // Reset settings mutation
  const resetSettingsMutation = useMutation({
    mutationFn: resetChatSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['chatSettings'], data);
      chatForm.reset(data);
      toast.success("Settings reset to defaults successfully!");
    },
    onError: (error: Error) => {
      toast.error(`Failed to reset settings: ${error.message}`);
    },
  });

  const onSubmitChatSettings = (data: ChatSettingsFormData) => {
    updateSettingsMutation.mutate(data);
  };

  const handleResetSettings = () => {
    if (confirm("Are you sure you want to reset all settings to their default values? This action cannot be undone.")) {
      resetSettingsMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center space-x-2 mb-6">
          <SettingsIcon className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
        <div className="text-center py-8">Loading settings...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center space-x-2 mb-6">
          <SettingsIcon className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
        <div className="text-center py-8 text-red-600">
          Error loading settings: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <SettingsIcon className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
        <Button
          onClick={handleResetSettings}
          variant="outline"
          className="flex items-center space-x-2"
          disabled={resetSettingsMutation.isPending}
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset to Defaults</span>
        </Button>
      </div>

      <div className="space-y-6">
        {/* Chat Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5" />
              <span>Chat Settings</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...chatForm}>
              <form onSubmit={chatForm.handleSubmit(onSubmitChatSettings)} className="space-y-6">
                <FormField
                  control={chatForm.control}
                  name="chat_service_prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chat Service Prompt</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter the system prompt for the chat service..."
                          className="min-h-[120px] bg-background border-border"
                          {...field}
                        />
                      </FormControl>
                      <div className="text-sm text-muted-foreground">
                        The system prompt that guides the AI's behavior. Use {"{context}"} and {"{query}"} as placeholders.
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={chatForm.control}
                  name="search_score_threshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Search Score Threshold</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.5"
                          max="1.0"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          className="bg-background border-border"
                        />
                      </FormControl>
                      <div className="text-sm text-muted-foreground">
                        Minimum similarity score for search results (0.5-1.0). Higher values return more relevant but fewer results.
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={chatForm.control}
                    name="enable_title_matching"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Enable Title Matching
                          </FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Boost search results that match page titles and headings.
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={chatForm.control}
                    name="enable_full_page_content"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Enable Full Page Content
                          </FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Use full page markdown content instead of chunks for better context.
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={chatForm.control}
                  name="max_pages"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum Pages</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="20"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          className="bg-background border-border"
                        />
                      </FormControl>
                      <div className="text-sm text-muted-foreground">
                        Maximum number of pages to retrieve and include in chat context (1-20).
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={chatForm.control}
                  name="empty_search_default_response"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empty Search Default Response</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter the default response when no search results are found..."
                          className="min-h-[80px] bg-background border-border"
                          {...field}
                        />
                      </FormControl>
                      <div className="text-sm text-muted-foreground">
                        The response shown when no relevant information is found in the knowledge base.
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={chatForm.control}
                  name="enable_full_validation_testing"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Enable Full Validation Testing
                        </FormLabel>
                        <div className="text-sm text-muted-foreground">
                          Enable comprehensive validation and testing of chat responses.
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="flex justify-end space-x-4">
                  <Button
                    type="submit"
                    disabled={updateSettingsMutation.isPending}
                    className="flex items-center space-x-2"
                  >
                    <Save className="h-4 w-4" />
                    <span>{updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}</span>
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
