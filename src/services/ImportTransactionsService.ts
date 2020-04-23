import { getCustomRepository, getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const trannsactionRepository = getCustomRepository(TransactionsRepository);
    const categoryRepository = getRepository(Category);

    const contactsReadStream = fs.createReadStream(filePath);

    const parses = csvParse({
      from_line: 2,
    });

    const parseCSV = contactsReadStream.pipe(parses);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );
      if (!title || !type || !value) return;
      categories.push(category);
      transactions.push({ title, value, type, category });
    });
    await new Promise(resolve => parseCSV.on('end', resolve));
    const existentCategories = await categoryRepository.find({
      where: {
        title: In(categories),
      },
    });
    const existentCategoriesTitle = existentCategories.map(
      (category: Category) => category.title,
    );
    const addCategoryTitles = categories
      .filter(category => !existentCategoriesTitle.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);
    const newCategories = categoryRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );
    await categoryRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existentCategoriesTitle];

    const createdTransactions = trannsactionRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        // category: finalCategories.find(
        //   category => category.title === transaction.category,
        // ),
      })),
    );

    await trannsactionRepository.save(createdTransactions);
    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
