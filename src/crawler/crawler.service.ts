import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer from 'puppeteer';

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(private configService: ConfigService) {}

  async crawl(url: string, strategyConfig: any): Promise<any> {
    const launchOptions: any = {
      headless: 'new', // Updated to use new Headless mode explicitly
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };

    // Only set executablePath if explicitly configured
    // Otherwise let puppeteer use its bundled chrome
    const executablePath = this.configService.get<string>(
      'PUPPETEER_EXECUTABLE_PATH',
    );
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }

    let browser;
    try {
      browser = await puppeteer.launch(launchOptions);
    } catch (launchError) {
      this.logger.warn(
        `Failed to launch browser with custom options. Trying default launch... Error: ${launchError.message}`,
      );
      // Fallback to default launch (bundled chromium)
      try {
        browser = await puppeteer.launch({
          headless: 'new', // Updated here as well
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      } catch (retryError) {
        this.logger.error(
          `Critical: Failed to launch browser even with defaults. Error: ${retryError.message}`,
        );
        throw retryError;
      }
    }

    try {
      const page = await browser.newPage();

      // Set user agent to avoid basic bot detection
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );

      this.logger.log(`Navigating to ${url}`);
      // Increase timeout and use domcontentloaded for faster/safer loading
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

      // Handle dynamic content loading if needed (e.g., scroll to bottom)
      if (strategyConfig.interaction_type === 'scroll') {
        await this.autoScroll(page);
      } else {
        // Always wait a bit for JS to render
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Check if List Crawling Mode is enabled
      if (strategyConfig.list_crawling?.enabled) {
        return await this.crawlList(page, strategyConfig, url);
      }

      // Default: Single Page Extraction
      return await this.extractPageData(page, strategyConfig, url);
    } catch (error) {
      this.logger.error(`Crawling failed for ${url}: ${error.message}`);
      // Return partial data or error info instead of throwing to allow task to complete
      return {
        url: url,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // New method for handling list -> detail crawling
  private async crawlList(
    page: any,
    strategyConfig: any,
    baseUrl: string,
  ): Promise<any> {
    const listConfig = strategyConfig.list_crawling;
    const results = [];

    this.logger.log(`Starting list crawling for ${baseUrl}`);

    try {
      // 1. Find all list items
      const listItems = await page.$$(listConfig.list_selector);
      this.logger.log(`Found ${listItems.length} list items`);

      const linksToVisit = [];

      // 2. Filter items and extract links
      for (const item of listItems) {
        // Check keywords filter if configured
        if (
          listConfig.keyword_filter_selector &&
          strategyConfig.keywords_filter?.length > 0
        ) {
          const textContent = await item
            .$eval(listConfig.keyword_filter_selector, (el) => el.textContent)
            .catch(() => '');

          const hasKeyword = strategyConfig.keywords_filter.some((kw) =>
            textContent?.toLowerCase().includes(kw.toLowerCase()),
          );

          if (!hasKeyword) continue;
        }

        // Extract link
        const link = await item
          .$eval(listConfig.link_selector, (el) => el.href)
          .catch(() => null);
        if (link) {
          linksToVisit.push(link);
        }
      }

      this.logger.log(`Found ${linksToVisit.length} matching links to crawl`);

      // 3. Visit each link and extract details
      // Limit to 5 for safety/performance in this demo version
      for (const link of linksToVisit.slice(0, 5)) {
        try {
          this.logger.log(`Navigating to detail page: ${link}`);
          // Navigate to detail page (reuse page or new page? Reuse is slower but saves memory. New page is faster parallel.)
          // Let's reuse page for simplicity and resource safety
          await page.goto(link, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
          });

          // Wait a bit
          await new Promise((r) => setTimeout(r, 1000));

          // Extract detail data using the standard extraction rules
          const detailData = await this.extractPageData(
            page,
            strategyConfig,
            link,
          );
          results.push(detailData);

          // Go back not needed if we just goto next url, but if we relied on back button it would be complex.
          // Just loop to next url.
        } catch (err) {
          this.logger.error(`Failed to crawl detail ${link}: ${err.message}`);
        }
      }

      // Return aggregated results
      // Since the system expects a single object or array, let's wrap it
      return {
        url: baseUrl,
        type: 'list_crawl',
        items_found: results.length,
        items: results,
      };
    } catch (error) {
      this.logger.error(`List crawling failed: ${error.message}`);
      throw error;
    }
  }

  private async extractPageData(
    page: any,
    strategyConfig: any,
    url: string,
  ): Promise<any> {
    const extractedData: any = {
      url: url,
      timestamp: new Date().toISOString(),
    };

    // 1. Basic Metadata
    try {
      extractedData.title = await page.title();
    } catch (e) {
      this.logger.warn(`Failed to get title for ${url}`);
    }

    // 2. Extract based on AI-generated rules
    if (
      strategyConfig.extraction_rules &&
      Array.isArray(strategyConfig.extraction_rules)
    ) {
      for (const rule of strategyConfig.extraction_rules) {
        try {
          const selector = rule.selector_hint;
          if (selector) {
            // Try to find element(s)
            const content = await page.evaluate((sel) => {
              const els = document.querySelectorAll(sel);
              if (els.length === 0) return null;
              // If multiple elements, return array. If one, return text.
              // Improvement: Clean text content
              const cleanText = (text) => text?.replace(/\s+/g, ' ').trim();

              if (els.length === 1) return cleanText(els[0].textContent);
              return Array.from(els)
                .map((e) => cleanText(e.textContent))
                .filter(Boolean);
            }, selector);

            if (content) {
              extractedData[rule.field_name] = content;
            }
          }
        } catch (e) {
          this.logger.warn(
            `Failed to extract field ${rule.field_name}: ${e.message}`,
          );
        }
      }
    }

    // 3. Robust Fallback: Extract main content if rules failed
    // Use Readability-like heuristic or just dump body text if specific selectors fail
    if (!extractedData.content || extractedData.content.length === 0) {
      const fallbackData = await page.evaluate(() => {
        // Try to find the biggest block of text
        const articles = document.querySelectorAll(
          'article, main, [role="main"], .content, #content',
        );
        if (articles.length > 0) {
          return articles[0].textContent
            ?.replace(/\s+/g, ' ')
            .trim()
            .substring(0, 2000);
        }
        // Fallback to body
        return document.body.textContent
          ?.replace(/\s+/g, ' ')
          .trim()
          .substring(0, 2000);
      });
      extractedData.fallback_content = fallbackData;

      // Generate summary from fallback content
      if (!extractedData.summary && fallbackData) {
        extractedData.summary = fallbackData.substring(0, 300) + '...';
      }
    }

    return extractedData;
  }

  private async autoScroll(page: any) {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight || totalHeight > 5000) {
            // Limit scroll depth
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }
}
