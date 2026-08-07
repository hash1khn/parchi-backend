import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignOffersDto {
  /**
   * The complete set of offers that should be live at this branch.
   * Replaces whatever the branch had before — send every offer you want kept,
   * not just the new ones. An empty array leaves the branch with no offers.
   */
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  offerIds: string[];
}
