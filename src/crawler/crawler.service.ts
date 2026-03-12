import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';

@Injectable()
export class CrawlerService {
  async crawl(url: string, strategy: any): Promise<any> {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);

    // TODO: Implement crawling logic based on strategy
    const title = await page.title();

    await browser.close();
    return { title, url };
  }
}
