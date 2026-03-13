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
}
