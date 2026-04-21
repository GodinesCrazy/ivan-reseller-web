import { PrismaClient } from '@prisma/client';
import logger from '../src/config/logger';

const prisma = new PrismaClient();

async function upliftProduct32714() {
  try {
    const product = await prisma.product.findUnique({
      where
