import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ApexFill, NgApexchartsModule } from 'ng-apexcharts';
import {
  ChartComponent,
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexYAxis,
  ApexDataLabels,
  ApexPlotOptions,
  ApexGrid,
  ApexStroke,
  ApexTooltip,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexMarkers, ApexStates
} from 'ng-apexcharts';
import { ViewChild } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDateRangePicker, MatDatepickerModule } from '@angular/material/datepicker';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';


export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  grid: ApexGrid;
  stroke: ApexStroke;
  tooltip: ApexTooltip;
  legend: ApexLegend;
  colors: string[];
};

export type PieChartOptions = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  stroke: ApexStroke;
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  chartLabels: string[];
  colors: string[];
}

export type DoughnutChartOptions = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  stroke: ApexStroke;
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  plotOptions: ApexPlotOptions;
  tooltip: ApexTooltip;
  chartLabels: string[];
  colors: string[];
}

export type AreaChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  stroke: ApexStroke;
  dataLabels: ApexDataLabels;
  fill: ApexFill;
  markers: ApexMarkers;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  grid: ApexGrid;
  tooltip: ApexTooltip
  legend: ApexLegend;
  colors: string[];
}

export type RadialChartOptions = {
  series: number[];
  chart: ApexChart;
  plotOptions: ApexPlotOptions;
  fill: ApexFill;
  stroke: ApexStroke;
  labels: string[];
  colors: string[];
};


@Component({
  selector: 'app-customertickets-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    NgApexchartsModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatDateRangePicker,
    FormsModule,
    MatSelectModule
  ],
  templateUrl: './customertickets.component.html',
  styleUrls: ['./customertickets.component.css']
})
export class CustomerticketsComponent implements OnInit, OnDestroy, OnChanges {

  @ViewChild("chart") chart!: ChartComponent;
  @Input('tickets') tickets = [];
  @Output('tabchange') tabChange = new EventEmitter<any>()

  public chartOptions!: Partial<ChartOptions>;
  public pieChart !: PieChartOptions
  public doughnutChart !: DoughnutChartOptions
  public areaChart !: AreaChartOptions
  public firstResponseChart!: RadialChartOptions
  public resolutionRateChart !: RadialChartOptions
  public customerSatisfactionChart !: RadialChartOptions

  private subscriptions: { [key: string]: Subscription } = {};

  pickerMode: string = 'month';
  selectedMonth: Date = new Date();
  displayMonth: string = '';

  categoryMap: any = {
    'Events & Process': 'event',
    'Journey Related': 'journey',
    'Eiflix Workshop': 'eiflix',
    'Critical Support': 'critical',
    'Downgrade, Cancellation & Exceptions': 'cancellation',
    'Cancellation - before Consumption': 'cancelbefore',
    'Cancellation - After Consumption': 'cancelafter',
    'Finance & Accounts': 'finance',
    'Referrals & Upgrades': 'referral',
    'In-App Support': 'inapp',
    'Others': 'others'
  };

  categoriesLabel = {
    'event': 'Events & Process',
    'journey': 'Journey Related',
    'eiflix': 'Eiflix Workshop',
    'critical': 'Critical Support',
    'cancellation': 'Downgrades / Cancellations',
    'cancelbefore': 'Cancel Before Consumption',
    'cancelafter': 'Cancel After Consumption',
    'finance': 'Finance & Accounts',
    'referral': 'Referrals & Upgrades',
    'inapp': 'In-App Support',
    'others': 'Others'
  }

  cardMap = {
    'unresolved': 'unresolved',
    'under2': '< 2 days',
    '2to7': '2 to 7 days',
    'over7': 'more than 7 days'
  }

  status = {
    'new': 'new',
    'resolved': 'resolved',
    'reply': 'need reply'
  }

  // Loading state
  isLoading: boolean = true;

  // Date range for current month
  startDate: Date;
  endDate: Date;
  monthyear

  negFilter = {
    startDate: new Date(),
    endDate: new Date(),
    monthyear: '',
    weekNumber: 1,
    weekYear: new Date().getFullYear(),
    weekDate: new Date(),
  }

  negFilterType = 'week'

  negligenceMetrics = {
    gross: 0,
    high: 0,
    moderate: 0,
    low: 0,
    no: 0
  }


  totalOpen: number = 0
  totalClosed: number = 0

  negligence = {
    flagged: 0,
    pendingReview: 0,
    reviewed: 0
  }

  avgCategoryBreakDown: { [index: string]: { total: number, count: number } } = {}

  categoryBreakdowns: { [index: string]: { [index: string]: { new: number, responded: number, reply: number } } } = {}

  openTicket: { [index: string]: number } = {}
  closedTicket: { [index: string]: number } = {}

  chatStatusBreakDown: { [index: string]: number } = {}


  constructor() {
    this.setCurrentMonth();
    this.initializeChartOptions();
  }

  ngOnInit(): void {
    // const categories = this.getCategories()
    // this.tickets = this.tickets.filter((ticket) => categories.includes(ticket.category))
    // this.updateWeekNumber();
    // this.applyFilter()
    // this.tickets.forEach((ticket) => {
    //   this.calCategoryBreakdown(ticket)
    // })
    // this.initChart()
    // this.initPieChart()
    // this.initDoughnutChart()
  }

  ngOnDestroy(): void {
    // Unsubscribe from all subscriptions
    Object.keys(this.subscriptions).forEach(key => {
      if (this.subscriptions[key]) {
        this.subscriptions[key].unsubscribe();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {

    const categories = this.getCategories()
    this.tickets = this.tickets.filter((ticket) => categories.includes(ticket.category))

    this.initAvg()
    this.initCatBreakDown()
    this.initOpenTicket()
    this.initClosedTicket()
    this.initChatstatusBreakBown()

    this.updateWeekNumber();
    this.applyFilter()
    this.tickets.forEach((ticket) => {
      this.calCategoryBreakdown(ticket)
    })
    this.initChart()
    this.initPieChart()
    this.initDoughnutChart()

  }

  private initializeChartOptions(): void {
    this.chartOptions = {
      series: [],
      chart: {
        type: "bar",
        height: 620,
        fontFamily: 'Inter, sans-serif',
        toolbar: { show: true }
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: "88%",
          borderRadius: 0
        }
      },
      dataLabels: {
        enabled: true
      },
      stroke: {
        show: false,
        width: 0,
        colors: ["transparent"]
      },
      xaxis: {
        categories: []
      },
      yaxis: {
        title: {
          text: "Number of Tickets"
        }
      },
      grid: {
        borderColor: 'rgba(0, 0, 0, 0.04)',
        strokeDashArray: 0
      },
      colors: ['#34C759', '#FF3B30'],
      tooltip: { enabled: true },
      legend: { show: true }
    };
  }

  initChart(): void {
    const categeoryKeys = this.getCategoriesKeys()
    const categories = this.getCategoriesLabel(categeoryKeys)

    const seriesData = [
      { name: 'Open Tickets', data: categeoryKeys.map((cat) => this.openTicket[cat]) },
      { name: 'Closed Tickets', data: categeoryKeys.map((cat) => this.closedTicket[cat]) }
    ];

    this.chartOptions = {
      series: seriesData,
      chart: {
        type: "bar",
        height: 620,
        fontFamily: 'Inter, sans-serif',
        toolbar: { show: true },
        animations: {
          enabled: true,
          speed: 1000,
          animateGradually: {
            enabled: true,
            delay: 150
          }
        }
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: "88%",
          borderRadius: 0
        }
      },
      dataLabels: {
        enabled: true
      },
      stroke: {
        show: false,
        width: 0,
        colors: ["transparent"]
      },
      xaxis: {
        categories: categories,
        labels: {
          rotate: 0,
          rotateAlways: false,
          trim: false,
          style: {
            colors: '#1d1d1f',
            fontSize: '10px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 700
          },
          offsetY: 5,
          formatter: (value: string) => {
            const words = value.split(' ');
            if (words.length >= 4) {
              return [words[0] + ' ' + words[1], words[2], words[3]];
            } else if (words.length === 3) {
              return [words[0] + ' ' + words[1], words[2]];
            } else if (words.length === 2) {
              return words;
            }
            return value;
          }
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        title: {
          text: "Number of Tickets",
          style: {
            color: '#86868b',
            fontSize: '14px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600
          }
        },
        labels: {
          style: {
            colors: '#86868b',
            fontSize: '13px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600
          },
        }
      },
      grid: {
        borderColor: 'rgba(0, 0, 0, 0.04)',
        strokeDashArray: 0,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
      },
      colors: ['#34C759', '#FF3B30',],
      tooltip: { enabled: true },
      legend: { show: true }
    };
  }

  initPieChart() {
    const status = ['new', 'responded', 'reply']
    const seriesOption = status.map((stat) => this.getCategoryTotal(["unresolved"], this.getCategoriesKeys(), [stat]))
    seriesOption.push(this.totalClosed)
    this.pieChart = {
      series: seriesOption,
      chart: {
        type: "pie",
        height: 340
      },
      stroke: {
        width: 2,
        colors: ["#ffffff"]
      },
      dataLabels: {
        enabled: false
      },
      legend: {
        show: true,
        position: "bottom",
        fontSize: "14px",
        markers: {
          // radius: 12
        },
        itemMargin: {
          horizontal: 14,
          vertical: 8
        }
      },
      colors: ["#3b82f6", "#10b981", "#f59e0b", "#64748b"],
      chartLabels: ['New', 'Responded', 'Need Reply', 'Closed'],
      tooltip: {
        enabled: true,
        custom: function ({ series, seriesIndex, dataPointIndex, w }: any) {
          const label = w.globals.labels[seriesIndex];
          const value = series[seriesIndex];
          const total = series.reduce((a: number, b: number) => a + b, 0);
          const percentage = ((value / total) * 100).toFixed(1);

          return `
            <div class="ticket-status-tooltip">
              <div class="ticket-tooltip-label">${label}</div>
              <div class="ticket-tooltip-value">${label}: ${value} (${percentage}%)</div>
            </div>
          `;
        }
      },


    }
  }

  initDoughnutChart() {
    const labesl = ['under2', '2to7', 'over7']
    const seriesOption = labesl.map((lab) => this.getCategoryTotal([lab], this.getCategoriesKeys(), ['new', 'responded', 'reply']))

    this.doughnutChart = {
      series: seriesOption,

      chart: {
        type: "donut",
        height: 320,
      },


      chartLabels: ["< 2 Days", "2–7 Days", "> 7 Days"],

      colors: ["#16A34A", "#3B82F6", "#E4080A"],
      stroke: {
        width: 4,
        colors: ["#ffffff"] // small white gap between arcs
      },

      plotOptions: {
        pie: {
          donut: {
            size: "74%",
            labels: {
              show: false
            }

          }
        }
      },

      dataLabels: {
        enabled: false
      },

      legend: {
        show: true,
        position: "bottom",
        markers: {
          strokeWidth: 0,
          offsetX: 0,
          offsetY: 0
        },
        itemMargin: { horizontal: 8, vertical: 4 }
      },

      tooltip: {
        enabled: true,
        custom: function ({ series, seriesIndex, dataPointIndex, w }: any) {
          const label = w.globals.labels[seriesIndex];
          const value = series[seriesIndex];
          const total = series.reduce((a: number, b: number) => a + b, 0);
          const percentage = ((value / total) * 100).toFixed(1);

          return `
            <div class="custom-tooltip">
              <div class="tooltip-label">${label}</div>
              <div class="tooltip-value">${label}: ${value} (${percentage}%)</div>
            </div>
          `;
        }
      }
    };


  }

  initAreaChart() {
    this.areaChart = {
      series: [
        {
          name: "Tickets Resolved",
          data: [145, 168, 180, 195, 182, 174]
        }
      ],
      chart: {
        type: "area",
        height: 350,
        toolbar: { show: false },
        zoom: {
          enabled: false
        },
        animations: {
          enabled: false
        },
      },
      colors: ["#a855f7"],


      stroke: {
        curve: "smooth",
        width: 3,
        colors: ["#a855f7"]
      },


      fill: {
        type: "solid",
        opacity: 0.15,
        colors: ["#a855f7"]
      },

      markers: {
        size: 5,
        colors: ["white"],
        strokeColors: "#a855f7",
        strokeWidth: 3
      },

      xaxis: {
        categories: ["Week 42", "Week 43", "Week 44", "Week 45", "Week 46", "Week 47"],
        labels: { style: { fontSize: "14px" } },
        axisBorder: { show: false }
      },

      yaxis: {
        min: 0,
        max: 200,
        tickAmount: 6,
        labels: { style: { fontSize: "14px" } }
      },

      grid: {
        borderColor: "#e5e7eb",
        strokeDashArray: 3,
        yaxis: { lines: { show: true } },
        xaxis: { lines: { show: false } }
      },


      dataLabels: { enabled: false },


      tooltip: { enabled: true },


      legend: { show: false }
    };

  }

  initFirstResponseRateChart() {
    this.firstResponseChart = {
      series: [75],
      chart: {
        type: "radialBar",
        height: 220
      },
      plotOptions: {
        radialBar: {
          hollow: { size: "60%" },
          track: { background: "#e5e7eb", strokeWidth: "100%" },
          dataLabels: {
            show: true,
            value: {
              fontSize: "28px",
              fontWeight: 700,
              offsetY: -8,
              formatter: (val: number) => `${val}%`
            },

          },

        }
      },

      fill: { type: "solid" },
      stroke: { lineCap: "round" },
      labels: [""],
      colors: ["#10b981"]  // Green
    };
  }

  initResolutionRateChart() {
    this.resolutionRateChart = {
      series: [85],
      chart: {
        type: "radialBar",
        height: 220
      },
      plotOptions: {
        radialBar: {
          hollow: { size: "60%" },
          track: { background: "#e5e7eb", strokeWidth: "100%" },
          dataLabels: {
            show: true,
            value: {
              fontSize: "28px",
              fontWeight: 700,
              offsetY: -8,
              formatter: (val: number) => `${val}%`
            }
          }
        }
      },
      fill: { type: "solid" },
      stroke: { lineCap: "round" },
      labels: [""],
      colors: ["#3b82f6"]  // Blue
    };

  }

  initCustomerSatisfactionChart() {
    this.customerSatisfactionChart = {
      series: [90],
      chart: {
        type: "radialBar",
        height: 220
      },
      plotOptions: {
        radialBar: {
          hollow: { size: "60%" },
          track: { background: "#e5e7eb", strokeWidth: "100%" },
          dataLabels: {
            show: true,
            value: {
              fontSize: "28px",
              fontWeight: 700,
              offsetY: -8,
              formatter: (val: number) => `${val}%`
            }
          }
        }
      },
      fill: { type: "solid" },
      stroke: { lineCap: "round" },
      labels: [""],
      colors: ["#a855f7"]  // Purple
    }
  }

  // Week navigation methods
  goToPreviousWeek(): void {
    this.negFilter.weekDate = new Date(this.negFilter.weekDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    this.updateWeekNumber();
  }

  // function to go to next week
  goToNextWeek(): void {
    this.negFilter.weekDate = new Date(this.negFilter.weekDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.updateWeekNumber();
  }

  // function to update the weeknumber
  updateWeekNumber(): void {
    this.negFilter.weekNumber = this.getWeekNumber(this.negFilter.weekDate);
    this.negFilter.weekYear = this.negFilter.weekDate.getFullYear();
    this.negFilter.startDate = this.negFilter.weekDate
    this.negFilter.endDate = this.negFilter.weekDate
    this.initNegMetrics()
  }

  // function to getweek number with date
  getWeekNumber(date: Date): number {
    const tempDate = new Date(date);
    tempDate.setHours(0, 0, 0, 0);

    this.negFilter.weekYear = tempDate.getFullYear();

    const dayOffset = (tempDate.getDay() - 2 + 7) % 7;
    tempDate.setDate(tempDate.getDate() - dayOffset);

    const yearStart = new Date(tempDate.getFullYear(), 0, 1);
    const yearStartDay = (yearStart.getDay() - 2 + 7) % 7;
    yearStart.setDate(yearStart.getDate() + (yearStartDay === 0 ? 0 : 7 - yearStartDay));

    const daysSinceYearStart = Math.floor((tempDate.getTime() - yearStart.getTime()) / 86400000);
    const weekNumber = Math.floor(daysSinceYearStart / 7) + 1;

    return weekNumber;
  }

  // Calculate days between two dates
  calculateDaysClosed(reportedDate: Date, closedDate: Date): number {
    if (!reportedDate || !closedDate) return 0;
    const timeDiff = closedDate.getTime() - reportedDate.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
    return daysDiff < 0 ? 0 : daysDiff;
  }

  // function to apply filters 
  onTabChange(category: string, chatStatus: string, date: string = '') {
    let filters = {
      category,
      chatStatus,
      date,
      status: 'open'
    }
    this.tabChange.emit(filters)
  }


  // Function to toggle date filter 
  toggleDate() {
    this.pickerMode = this.pickerMode == 'month' ? 'range' : 'month';
    this.setCurrentMonth();
    this.applyFilter()
  }

  // Function to set current month date 
  setCurrentMonth() {
    const now = new Date();
    this.startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    this.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.monthyear = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, '0');
  }

  // Update date based on month selection 
  updateDate() {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);

    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);
    this.applyFilter()

  }

  // move to next month 
  forwardMonth() {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);
    month = month != 12 ? month + 1 : 1;
    year = month == 1 ? year + 1 : year;
    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);
    this.monthyear = year + "-" + String(month).padStart(2, '0');
    this.applyFilter()

  }

  // move to previous month 
  backwardMonth() {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);
    month = month != 1 ? month - 1 : 12;
    year = month == 12 ? year - 1 : year;
    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);
    this.monthyear = year + "-" + String(month).padStart(2, '0');
    this.applyFilter()

  }


  // date filter to only select tuesday
  onlyTuesdayFilter = (date: Date | null): boolean => {
    if (!date) return false;
    return date.getDay() === 2; // 2 = Tuesday
  };

  getWeeksForRange() {
    let startDate = new Date()
    startDate.setHours(0, 0, 0, 999)
    let endDate = new Date()
    endDate.setHours(0, 0, 0, 999)

    let startWeek = startDate.getFullYear() + '-' + this.getWeekNumber(startDate)
    let endWeek = endDate.getFullYear() + '-' + this.getWeekNumber(endDate)

    while (startWeek !== endWeek) {
      startDate.setDate(startDate.getDate() + 7)
      startWeek = startDate.getFullYear() + '-' + this.getWeekNumber(startDate)
    }
  }

  // function to change negligence values based on weeknumber
  initNegMetrics() {
    this.negligenceMetrics = {
      gross: 0,
      high: 0,
      moderate: 0,
      low: 0,
      no: 0
    }
    let tickets = this.tickets

    let startYear = this.negFilter.startDate.getFullYear()
    let startWeek = this.getWeekNumber(this.negFilter.startDate)

    let endYear = this.negFilter.endDate.getFullYear()
    let endWeek = this.getWeekNumber(this.negFilter.endDate)

    tickets.forEach((ticket) => {

      // Negligence metrics for current week
      if (![null, undefined, ""].includes(ticket['negligencemetrics'])) {
        const negMetrics = Object.entries(ticket['negligencemetrics'])
        if (negMetrics.length !== 0) {
          let metricValue = 0
          let metricCount = 0
          for (let negligence of negMetrics) {
            const [weekyear, metric] = negligence
            const year = Number(weekyear.split('-')[1])
            const week = Number(weekyear.split('-')[0])
            if ((startWeek <= week && week <= endWeek) && (startYear <= year && year <= endYear) && typeof metric === 'number') {
              metricValue += metric
              metricCount++
            }
          }


          if (metricCount !== 0) {
            metricValue = Math.floor(metricValue / metricCount)
            if (metricValue > 8) {
              this.negligenceMetrics.gross++;
            } else if (metricValue >= 6 && metricValue <= 8) {
              this.negligenceMetrics.high++;
            } else if (metricValue >= 4 && metricValue <= 5) {
              this.negligenceMetrics.moderate++;
            } else if (metricValue >= 1 && metricValue <= 3) {
              this.negligenceMetrics.low++;
            } else if (metricValue === 0) {
              this.negligenceMetrics.no++;
            }

          }
        }
      }

    })
  }

  // function to handle the filter type change of negligence metrics
  onFilterTypeChange() {
    switch (this.negFilterType) {
      case 'month':
        this.setNegCurrentMonth()
        this.updateNegMonth()
        break;
      case 'daterange':
        this.negFilter.startDate = new Date()
        this.negFilter.endDate = new Date()
        this.initNegMetrics()
        break
      case 'week':
        this.negFilter.weekDate = new Date()
        this.updateWeekNumber()
        break
    }
  }

  // Update date based on month selection 
  updateNegMonth() {
    let year = parseInt(this.negFilter.monthyear.split('-')[0]);
    let month = parseInt(this.negFilter.monthyear.split('-')[1]);

    // Create a safe date at the start of the month
    let date = new Date(year, month - 1, 1);

    const day = date.getDay();
    const diff = (2 - day + 7) % 7;
    const firstTuesday = new Date(date);
    firstTuesday.setDate(firstTuesday.getDate() + diff);

    let lastTuesday = new Date(firstTuesday);

    while (true) {
      const next = new Date(lastTuesday);
      next.setDate(next.getDate() + 7);

      if (next.getMonth() !== (month - 1)) {
        break;
      }

      lastTuesday = next;
    }

    // End of the Tuesday week = Monday (add 6 days)
    const lastWeekEnd = new Date(lastTuesday);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);

    this.negFilter.startDate = firstTuesday;
    this.negFilter.endDate = lastWeekEnd;
    this.initNegMetrics()

  }

  // move to next month 
  forwardNegMonth() {
    let year = parseInt(this.negFilter.monthyear.split('-')[0]);
    let month = parseInt(this.negFilter.monthyear.split('-')[1]);
    month = month != 12 ? month + 1 : 1;
    year = month == 1 ? year + 1 : year;
    this.negFilter.monthyear = year + "-" + String(month).padStart(2, '0');
    this.updateNegMonth()

  }

  // move to previous month .
  backwardNegMonth() {
    let year = parseInt(this.negFilter.monthyear.split('-')[0]);
    let month = parseInt(this.negFilter.monthyear.split('-')[1]);
    month = month != 1 ? month - 1 : 12;
    year = month == 12 ? year - 1 : year;
    this.negFilter.monthyear = year + "-" + String(month).padStart(2, '0');
    this.updateNegMonth()

  }

  // Function to set current month date 
  setNegCurrentMonth() {
    this.negFilter.monthyear = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, '0');
  }

  // function to initalize avgerage for categories
  initAvg() {
    const keys: string[] = Object.values(this.categoryMap)
    keys.forEach((key: string) => {
      this.avgCategoryBreakDown[key] = {
        total: 0,
        count: 0
      }
    })
  }

  // function to initalize category breakdown
  initCatBreakDown() {
    const categories: string[] = Object.values(this.categoryMap)
    const breakDownNames: string[] = ['unresolved', 'under2', '2to7', 'over7']

    breakDownNames.forEach((key: string) => {
      this.categoryBreakdowns[key] = {}
      categories.forEach((catKey: string) => {
        this.categoryBreakdowns[key][catKey] = {
          new: 0,
          responded: 0,
          reply: 0
        }
      })
    })

  }

  // function to initalize open tickets for graph
  initOpenTicket() {
    const categories: string[] = Object.values(this.categoryMap)
    categories.forEach((cat) => {
      this.openTicket[cat] = 0
    })
  }

  // function to initalize closed tickets for graph
  initClosedTicket() {
    const categories: string[] = Object.values(this.categoryMap)
    categories.forEach((cat) => {
      this.closedTicket[cat] = 0
    })
  }

  //function to init chatstatusbreakdown 

  initChatstatusBreakBown() {
    const status = Object.keys(this.status)
    status.forEach((stat) => {
      this.chatStatusBreakDown[stat] = 0
    })
  }

  // function to calculate the metrics for each category for each cards
  calCategoryBreakdown(ticket: any): void {
    const now = new Date()
    const reportedDate = ticket['reporteddate']?.toDate()
    const chatStatus = ticket?.chatstatus?.toLowerCase()
    const categeoryKey = this.categoryMap[ticket?.category || '']
    const status = ticket?.status?.status?.toLowerCase()
    // if (!['new', 'responded', 'decision making', 'pending'].includes(chatStatus)) {
    //   console.log('chatstatus : ', ticket?.chatstatus, status)
    // }

    if ([null, undefined, ''].includes(categeoryKey) || status !== 'open') return

    this.openTicket[categeoryKey]++

    this.setCategory('unresolved', categeoryKey, chatStatus)
    if (!reportedDate) return
    const daysSinceReported = Math.floor((now.getTime() - reportedDate.getTime()) / (1000 * 3600 * 24));

    if (daysSinceReported < 2) {
      this.setCategory('under2', categeoryKey, chatStatus)
    } else if (daysSinceReported >= 2 && daysSinceReported <= 7) {
      this.setCategory('2to7', categeoryKey, chatStatus)
    } else if (daysSinceReported > 7) {
      this.setCategory('over7', categeoryKey, chatStatus)
    }

  }

  // function allows to set metric for an category
  setCategory(key: string, categeory: string, chatStatus: any,): void {
    if (chatStatus === 'new') {
      this.categoryBreakdowns[key][categeory]['new']++
    } else if (chatStatus === 'responded') {
      this.categoryBreakdowns[key][categeory]['responded']++
    } else if (['decision making', 'pending'].includes(chatStatus)) {
      this.categoryBreakdowns[key][categeory]['reply']++
    }
  }



  // function to apply filters
  applyFilter() {
    let totalOpen = 0
    let totalClosed = 0
    this.negligence = {
      flagged: 0,
      pendingReview: 0,
      reviewed: 0
    }
    this.initAvg()
    this.initClosedTicket()
    this.initChatstatusBreakBown()
    this.tickets.forEach((ticket) => {
      const status = ticket?.status?.status?.toLowerCase()
      const date = ticket['status']?.date?.toDate()
      const chatStatus = ticket['chatstatus']?.toLowerCase()
      const categeoryKey = this.categoryMap[ticket['category'] || '']


      if (ticket['flag']) {
        this.negligence.flagged++;
      }

      if (status === 'open') {
        totalOpen++

        if (this.isInSelectedRange(date)) {

          if (![null, undefined, ""].includes(ticket['review'])) {
            if (Object.keys(ticket['review']).length === 0) {
              this.negligence.pendingReview++;
            } else {
              this.negligence.reviewed++;
            }
          }

        }
      }
      else if (status === 'closed' && this.isInSelectedRange(date)) {
        totalClosed++

        if (![null, undefined, ''].includes(categeoryKey)) {
          this.closedTicket[categeoryKey]++

          if (![null, undefined, ''].includes(ticket['status']?.date)) {
            this.setAvgDaysToClosed(categeoryKey, ticket)
          }
        }

      }
    })
    this.totalOpen = totalOpen
    this.totalClosed = totalClosed
    this.initChart()
    this.initPieChart()
  }

  // function to load the tickets metrics
  // loadTicketsMetric(ticket: any) {

  //   const status = ticket?.status?.status?.toLowerCase()
  //   const date = ticket['status']?.date?.toDate()
  //   const chatStatus = ticket['chatstatus']?.toLowerCase()
  //   const categeoryKey = this.categoryMap[ticket['category'] || '']


  //   if (ticket['flag']) {
  //     this.negligence.flagged++;
  //   }

  //   if (status === 'open') {
  //     this.totalOpen++

  //     if (this.isInSelectedRange(date)) {

  //       if (![null, undefined, ""].includes(ticket['review'])) {
  //         if (Object.keys(ticket['review']).length === 0) {
  //           this.negligence.pendingReview++;
  //         } else {
  //           this.negligence.reviewed++;
  //         }
  //       }

  //       if (chatStatus === 'new') {
  //         this.chatStatusBreakDown['new']++
  //       } else if (chatStatus === 'responded') {
  //         this.chatStatusBreakDown['responded']++
  //       } else if (['decision making', 'pending'].includes(chatStatus)) {
  //         this.chatStatusBreakDown['reply']++
  //       }
  //     }
  //   }
  //   else if (status === 'closed' && this.isInSelectedRange(date)) {
  //     this.totalClosed++

  //     if (![null, undefined, ''].includes(categeoryKey)) {
  //       this.closedTicket[categeoryKey]++

  //       if (ticket['status']?.date) {
  //         this.setAvgDaysToClosed(categeoryKey, ticket)
  //       }
  //     }

  //   }
  // }

  isInSelectedRange(date: Date) {
    const startDate = new Date(this.startDate)
    const endDate = new Date(this.endDate)

    startDate.setHours(0, 0, 0, 0)
    endDate.setHours(23, 59, 59, 999)

    return startDate <= date && endDate >= date
  }

  setAvgDaysToClosed(categeory: string, ticket: any) {
    // console.log(this.avgCategoryBreakDown , categeory)
    this.avgCategoryBreakDown[categeory].count++
    this.avgCategoryBreakDown[categeory].total += Number(
      this.calculateDaysClosed(
        ticket['reporteddate']?.toDate(),
        ticket['status']?.date?.toDate()
      )
    )
  }

  get getOverAllAvg() {
    let total = 0
    let count = 0
    const categories: string[] = Object.values(this.categoryMap)
    categories.forEach((catKey) => {
      total += this.avgCategoryBreakDown[catKey].total
      count += this.avgCategoryBreakDown[catKey].count
    })

    return count !== 0 ? total / count : 0

  }

  getAvgForCategory(categeory: string) {
    return this.avgCategoryBreakDown[categeory].count !== 0 ? this.avgCategoryBreakDown[categeory].total / this.avgCategoryBreakDown[categeory].count : 0
  }

  // function to get categories
  getCategories() {
    return Object.keys(this.categoryMap)
  }

  getCategoriesKeys(): string[] {
    return Object.values(this.categoryMap)
  }

  getCategoryTotal(key: string[], categeory: string[], chatStatus: string[]): number {
    return key.reduce((keyTotal, key) => keyTotal +
      categeory.reduce((catTotal, cat) => catTotal +
        chatStatus.reduce((satTotal, status) =>
          satTotal + this.categoryBreakdowns[key][cat][status], 0), 0), 0)
  }

  getStatusLabel(status: string) {
    return this.status[status] || status
  }

  getCategoriesLabel(categeories: string[]) {
    return categeories.map((cat) => this.categoriesLabel[cat])
  }

  getCategorySortByStatus(cardKey: string, status: string = 'new'): string[] {
    const categeories: string[] = this.getCategories()
    if (!this.status[status] || !this.cardMap[cardKey]) {
      return categeories
    }
    categeories.sort((cat_1: string, cat_2: string) => {
      return this.categoryBreakdowns[cardKey][this.categoryMap[cat_2]][status] - this.categoryBreakdowns[cardKey][this.categoryMap[cat_1]][status]
    })

    return categeories
  }


}



