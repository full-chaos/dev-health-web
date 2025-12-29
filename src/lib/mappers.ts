import type { InvestmentResponse } from "@/lib/types";

export const mapInvestmentToNestedPie = (data: InvestmentResponse) => {
  return {
    categories: data.categories.map((category) => ({
      key: category.key,
      name: category.name,
      value: category.value,
    })),
    subtypes: data.subtypes.map((subtype) => ({
      name: subtype.name,
      value: subtype.value,
      parentKey: subtype.parentKey,
    })),
  };
};
