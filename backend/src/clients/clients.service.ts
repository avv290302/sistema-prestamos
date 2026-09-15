import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { ListClientsDto } from "./dto/list-clients.dto";

const clientSelect = {
  id: true,
  fullName: true,
  phone: true,
  address: true,
  notes: true,
  referenceName: true,
  referencePhone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
} satisfies Prisma.ClientSelect;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClientDto, createdById: string) {
    return this.prisma.client.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        address: dto.address,
        notes: dto.notes,
        referenceName: dto.referenceName,
        referencePhone: dto.referencePhone,
        createdById,
      },
      select: clientSelect,
    });
  }

  async findAll(query: ListClientsDto) {
    const { page, limit, search } = query;

    const where: Prisma.ClientWhereInput = search
      ? {
          OR: [
            {
              fullName: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              phone: {
                contains: search,
              },
            },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.client.findMany({
          where,
          select: clientSelect,
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
          ],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.client.count({ where }),
      ],
      {
        isolationLevel: "RepeatableRead",
      },
    );

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: clientSelect,
    });

    if (!client) {
      throw new NotFoundException("No se encontró el cliente.");
    }

    return client;
  }
}