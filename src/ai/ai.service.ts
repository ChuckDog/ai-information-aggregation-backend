import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class AIService {
  private openai: OpenAI;
  private readonly logger = new Logger(AIService.name);

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('QWEN_API_KEY'),
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', // Qwen compatible endpoint
    });
  }

  async generateStrategy(
    instructions: string,
    urls: string[] = [],
  ): Promise<any> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'qwen-plus', // Use qwen-plus or qwen-max
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
      });

      const content = completion.choices[0].message.content;
      // Clean up potential markdown code blocks if the model ignores the instruction
      const jsonString = content
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '');

      return JSON.parse(jsonString);
    } catch (error) {
      this.logger.error('Failed to generate strategy with Qwen', error);
      // Fallback or rethrow
      throw new Error('Failed to generate crawling strategy: ' + error.message);
    }
  }
}
