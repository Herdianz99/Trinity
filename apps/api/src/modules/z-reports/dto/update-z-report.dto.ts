import { IsString, IsOptional, IsNumber, IsDateString, IsInt } from 'class-validator';

export class UpdateZReportDto {
  @IsOptional() @IsInt() zNumber?: number;
  @IsOptional() @IsDateString() reportDate?: string;
  @IsOptional() @IsString() machineSerial?: string;

  // Ventas
  @IsOptional() @IsNumber() salesExemptBs?: number;
  @IsOptional() @IsNumber() salesTaxBase1Bs?: number;
  @IsOptional() @IsNumber() salesTax1Bs?: number;
  @IsOptional() @IsNumber() salesTaxBase2Bs?: number;
  @IsOptional() @IsNumber() salesTax2Bs?: number;
  @IsOptional() @IsNumber() salesTaxBase3Bs?: number;
  @IsOptional() @IsNumber() salesTax3Bs?: number;

  // NC
  @IsOptional() @IsNumber() ncExemptBs?: number;
  @IsOptional() @IsNumber() ncTaxBase1Bs?: number;
  @IsOptional() @IsNumber() ncTax1Bs?: number;
  @IsOptional() @IsNumber() ncTaxBase2Bs?: number;
  @IsOptional() @IsNumber() ncTax2Bs?: number;
  @IsOptional() @IsNumber() ncTaxBase3Bs?: number;
  @IsOptional() @IsNumber() ncTax3Bs?: number;

  // ND
  @IsOptional() @IsNumber() ndExemptBs?: number;
  @IsOptional() @IsNumber() ndTaxBase1Bs?: number;
  @IsOptional() @IsNumber() ndTax1Bs?: number;
  @IsOptional() @IsNumber() ndTaxBase2Bs?: number;
  @IsOptional() @IsNumber() ndTax2Bs?: number;
  @IsOptional() @IsNumber() ndTaxBase3Bs?: number;
  @IsOptional() @IsNumber() ndTax3Bs?: number;

  // IGTF
  @IsOptional() @IsNumber() igtfSalesBaseBs?: number;
  @IsOptional() @IsNumber() igtfSalesTaxBs?: number;
  @IsOptional() @IsNumber() igtfNcBaseBs?: number;
  @IsOptional() @IsNumber() igtfNcTaxBs?: number;
  @IsOptional() @IsNumber() igtfNdBaseBs?: number;
  @IsOptional() @IsNumber() igtfNdTaxBs?: number;

  // Rangos
  @IsOptional() @IsString() lastInvoiceNumber?: string;
  @IsOptional() @IsString() firstInvoiceNumber?: string;
  @IsOptional() @IsInt() invoiceCount?: number;
  @IsOptional() @IsString() lastCreditNoteNumber?: string;
  @IsOptional() @IsString() firstCreditNoteNumber?: string;
  @IsOptional() @IsInt() creditNoteCount?: number;
  @IsOptional() @IsString() lastDebitNoteNumber?: string;
  @IsOptional() @IsString() firstDebitNoteNumber?: string;
  @IsOptional() @IsInt() debitNoteCount?: number;

  @IsOptional() @IsString() notes?: string;
}
