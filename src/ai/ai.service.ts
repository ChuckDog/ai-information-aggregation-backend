import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly apiUrl =
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  constructor(private configService: ConfigService) {}

  async generateStrategy(
    instructions: string,
    urls: string[] = [],
  ): Promise<any> {
    try {
      this.logger.log('Sending request to Qwen API (via axios)...');

      const apiKey = this.configService.get<string>('QWEN_API_KEY');

      const payload = {
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: `You are an expert web scraping strategist. Analyze the user's request and target URLs to generate a JSON configuration for a web crawler.
            
            Return ONLY a valid JSON object with the following structure:
            {
              "summary": "Brief summary of what to scrape",
              "extraction_rules": [
                {
                  "field_name": "name of the field (e.g., title, price, author)",
                  "description": "description of what to extract",
                  "selector_hint": "suggested CSS selector or semantic tag (e.g., h1, .price, article)" 
                }
              ],
              "list_crawling": {
                  "enabled": false, // Set to true if user wants to crawl a list of items and then their details
                  "list_selector": "CSS selector for the list items (e.g., 'ul.news-list > li')",
                  "link_selector": "CSS selector for the link inside the list item (e.g., 'a.title-link')",
                  "keyword_filter_selector": "CSS selector for the element containing text to filter by (e.g., '.title-text')",
                  "next_page_selector": "Optional selector for next page button"
              },
              "keywords_filter": ["keyword1", "keyword2"],
              "max_depth": 1, 
              "interaction_type": "static" | "scroll" | "click_pagination"
            }
            Do not include markdown formatting (like \`\`\`json). Just the raw JSON string.`,
          },
          {
            role: 'user',
            content: `User Instructions: "${instructions}". Target URLs: ${JSON.stringify(
              urls,
            )}`,
          },
        ],
        temperature: 0.2,
      };

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000, // 30 seconds timeout
      });

      this.logger.log('Qwen API response received.');
      const content = response.data.choices[0].message.content;

      // Clean up potential markdown code blocks
      const jsonString = content
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '');

      return JSON.parse(jsonString);
    } catch (error) {
      this.logger.error(
        'Failed to generate strategy with Qwen: ' +
          (error.response?.data?.error?.message || error.message),
      );

      // Fallback strategy
      this.logger.warn('Using fallback strategy due to AI error.');
      return {
        summary: 'Fallback extraction (AI unavailable)',
        extraction_rules: [
          {
            field_name: 'title',
            description: 'Page Title',
            selector_hint: 'title',
          },
          {
            field_name: 'content',
            description: 'Main Content',
            selector_hint: 'body',
          },
        ],
        keywords_filter: [],
        max_depth: 1,
        interaction_type: 'static',
      };
    }
  }

  async generateStructuringSchema(instructions: string): Promise<any> {
    try {
      this.logger.log('Generating structuring schema via Qwen...');
      const apiKey = this.configService.get<string>('QWEN_API_KEY');

      const payload = {
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: `You are a data architect. Analyze the user's natural language request for data formatting and generate a JSON Schema (Draft-07) that describes the desired output structure.
            
            Return ONLY the raw JSON Schema object. Do not include markdown formatting.
            The root type should usually be 'object' or 'array' depending on the user's request.
            Example user request: "I want a list of articles with title and date"
            Example output:
            {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "title": { "type": "string" },
                  "date": { "type": "string" }
                },
                "required": ["title", "date"]
              }
            }`,
          },
          {
            role: 'user',
            content: `User Instructions: "${instructions}"`,
          },
        ],
        temperature: 0.1,
      };

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      });

      const content = response.data.choices[0].message.content;
      const jsonString = content
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '');
      return JSON.parse(jsonString);
    } catch (error) {
      this.logger.error(
        'Failed to generate schema: ' +
          (error.response?.data?.error?.message || error.message),
      );
      throw error;
    }
  }

  async generateCronExpression(description: string): Promise<string> {
    try {
      this.logger.log('Generating cron expression via Qwen...');
      const apiKey = this.configService.get<string>('QWEN_API_KEY');

      const payload = {
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: `You are an expert in cron expressions. Convert the user's natural language schedule description into a valid standard cron expression (5 or 6 fields).
            
            Rules:
            1. Return ONLY the cron expression string. No markdown, no explanations, no JSON.
            2. If the description is invalid or cannot be converted, return an empty string.
            3. Standard cron format: "minute hour day-of-month month day-of-week" (optional seconds at start)
            
            Examples:
            User: "every hour" -> Output: "0 * * * *"
            User: "every day at 8 am" -> Output: "0 8 * * *"
            User: "every Monday at 9:30" -> Output: "30 9 * * 1"`,
          },
          {
            role: 'user',
            content: `Description: "${description}"`,
          },
        ],
        temperature: 0.1,
      };

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 10000,
      });

      const content = response.data.choices[0].message.content.trim();
      // Remove any potential quotes or markdown
      return content.replace(/^["'`]|["'`]$/g, '');
    } catch (error) {
      this.logger.error(
        'Failed to generate cron expression: ' +
          (error.response?.data?.error?.message || error.message),
      );
      return '';
    }
  }

  async structureData(data: any, schema: any): Promise<any> {
    try {
      this.logger.log('Structuring data via Qwen...');
      const apiKey = this.configService.get<string>('QWEN_API_KEY');

      // Optimization: If data is too large, we might need to truncate or summarize.
      // For now, we assume data fits in context window (Qwen-plus has 32k or more).
      const dataStr = JSON.stringify(data).substring(0, 50000); // Simple safety truncation

      const payload = {
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: `You are a data transformation engine. 
            Input: Raw JSON data and a target JSON Schema.
            Output: The Raw Data transformed to strictly adhere to the Target JSON Schema.
            
            Rules:
            1. Extract relevant information from Raw Data to populate the fields defined in the Schema.
            2. If a field cannot be found, use null or an empty string/array as appropriate.
            3. Return ONLY the valid JSON result. No markdown.`,
          },
          {
            role: 'user',
            content: `Target Schema: ${JSON.stringify(
              schema,
            )}\n\nRaw Data: ${dataStr}`,
          },
        ],
        temperature: 0.1,
      };

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 60000, // Longer timeout for processing
      });

      const content = response.data.choices[0].message.content;
      const jsonString = content
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '');
      return JSON.parse(jsonString);
    } catch (error) {
      this.logger.error(
        'Failed to structure data: ' +
          (error.response?.data?.error?.message || error.message),
      );
      return { error: 'Failed to structure data', raw: data };
    }
  }
}
