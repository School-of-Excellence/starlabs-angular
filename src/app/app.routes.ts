import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { roleGuard } from './role.guard';
import { pendingUploadsGuard } from './content/episodes-dashboard/upload-studio/pending-uploads.guard';

export const routes: Routes = [
  {path: 'slackwebhookurls',loadComponent:()=> import('./slackwebhookurls/slackwebhookurls.component').then(m => m.SlackwebhookurlsComponent), canActivate:[authGuard]},
  {path: 'journeyonboardingdetail', loadComponent: () => import('./journey-onboarding-detail/journey-onboarding-detail.component').then(m => m.JourneyOnboardingDetailComponent), canActivate:[authGuard]},
  {path: '', redirectTo: '/EISDashboard', pathMatch:'full'},
  {path: 'login', loadComponent: () => import('./login/login.component').then(m => m.LoginComponent)},
  {path: 'routeconfiguration', loadComponent: () => import('./route-configuration-duplicate/route-configuration.component').then(m => m.RouteConfigurationComponent), canActivate:[authGuard]},
  {path: 'addjourney', loadComponent: () => import('./Product Designer/addjourney/addjourney.component').then(m => m.AddjourneyComponent), canActivate:[authGuard]},
  {path: 'addpackage', loadComponent: () => import('./Product Designer/addpackage/addpackage.component').then(m => m.AddpackageComponent), canActivate:[authGuard]},
  {path: 'packagedesign', loadComponent: () => import('./Product Designer/package-design/package-design.component').then(m => m.PackageDesignComponent), canActivate:[authGuard]},
  {path: 'atcmodel', loadComponent: () => import('./Product Designer/product-atcmodel/view-atcmodel/view-atcmodel.component').then(m => m.ViewAtcmodelComponent), canActivate: [authGuard]},
  {path: 'journeyproductmap', loadComponent: () => import('./Product Designer/journey-product/journey-product/journey-product.component').then(m => m.JourneyProductComponent), canActivate: [authGuard]},
  {path: 'createaelnames', loadComponent: () => import('./Product Designer/create-ael-names/create-ael-names.component').then(m => m.CreateAelNamesComponent), canActivate: [authGuard]},
  {path: 'addproduct', loadComponent: () => import('./Product Designer/add-product/add-product.component').then(m => m.AddProductComponent), canActivate:[authGuard]},
  {path: 'viewproductmodeplaylist', loadComponent: () => import('./Product Designer/view-product-mode-playlist/view-product-mode-playlist.component').then(m => m.ViewProductModePlaylistComponent), canActivate:[authGuard]},
  {path: 'productdelivery', loadComponent: () => import('./Product Designer/product-delivery/product-delivery.component').then(m => m.ProductDeliveryComponent), canActivate:[authGuard]},
  {path: 'deliverysequence', loadComponent: () => import('./Product Designer/delivery-sequence/delivery-sequence.component').then(m => m.DeliverySequenceComponent), canActivate:[authGuard]},
  {path: 'profilelist', loadComponent: () => import('./Participants Profile Management/profilelist/profilelist.component').then(m => m.ProfilelistComponent), canActivate:[authGuard]},
  {path: 'app-flow-breaks', loadComponent: () => import('./Participants Profile Management/app-flow-breaks/app-flow-breaks.component').then(m => m.AppFlowBreaksComponent), canActivate:[authGuard]},
  {path: 'participantproduct', loadComponent: () => import('./Participants Profile Management/participant-product/participant-product.component').then(m => m.ParticipantProductComponent), canActivate:[authGuard]},
  {path: 'ProfileScreen', loadComponent: () => import('./Participants Profile Management/new-profile/new-profile.component').then(m => m.NewProfileComponent), canActivate:[authGuard]},
  {path: 'journeysupport/:pid', loadComponent: () => import('./Journey Onboarding/journeyplan/journeyplan.component').then(m => m.JourneyplanComponent), canActivate:[authGuard]},
  {path: 'participantdeliverysequence/:pid', loadComponent: () => import('./Participants Profile Management/participant-delivery-sequence/participant-delivery-sequence.component').then(m => m.ParticipantDeliverySequenceComponent), canActivate:[authGuard]},
  {path: 'participantpurchase/:pid', loadComponent: () => import('./Participants Profile Management/journey-product-purchase/journey-product-purchase.component').then(m => m.JourneyProductPurchaseComponent), canActivate:[authGuard]},
  {path: 'profilesummary/:profileid', loadComponent: () => import('./Participants Profile Management/profile-summary/profile-summary.component').then(m => m.ProfileSummaryComponent), canActivate: [authGuard]},
  {path: 'userprofile/:id', loadComponent: () => import('./Participants Profile Management/userprofile/userprofile.component').then(m => m.UserprofileComponent), canActivate: [authGuard]},
  //userprofile_old
  {path: 'userprofile_old', loadComponent: () => import('./Participants Profile Management/userprofile_old/userprofile_old.component').then(m => m.UserprofileComponent), canActivate: [authGuard]},
  {path: 'deliveryactivities', loadComponent: () => import('./Product Designer/delivery-set/delivery-set.component').then(m => m.DeliverySetComponent), canActivate:[authGuard]},
  {path: 'eventopportunitydashboard', loadComponent: () => import('./queue system/event-opportunity-dashboard/event-opportunity-dashboard.component').then(m => m.EventOpportunityDashboardComponent), canActivate:[authGuard]},
  {path: 'arena/:queueid/:stage', loadComponent: () => import('./queue system/arena-board/arena-board.component').then(m => m.ArenaBoardComponent), canActivate:[authGuard]},
  {path: 'formtemplate', loadComponent: () => import('./Product Designer/delivery-set/formtemplate/formtemplate.component').then(m => m.FormtemplateComponent), canActivate:[authGuard]},
  {path: 'queuelist', loadComponent: () => import('./queue system/queue-list/queue-list.component').then(m => m.QueueListComponent), canActivate:[authGuard]},
  // {path: 'content-upload-v2', loadComponent: () => import('./content-upload-version2/content-upload-version2.component').then(m => m.ContentUploadVersion2Component)},
  // {path: 'userprofile_old/:id', loadComponent: () => import('./Participants Profile Management/userprofile_old/userprofile_old.component').then(m => m.UserprofileComponent), canActivate: [authGuard]},
  {path: 'eiflixtelemetry', loadComponent: () => import('./eiflix-telemetry/eiflix-telemetry.component').then(m => m.EiflixTelemetryComponent), canActivate:[authGuard]},
  {
    path: 'content-upload-v2',
    loadComponent: () =>
      import('./content-upload-version2/content-upload-version2.component')
        .then(m => m.ContentUploadVersion2Component),canActivate:[authGuard],
    children: [

      { path: 'audiodashboard',
        loadComponent: () =>
          import('./content/audio-dashboard/audio-dashboard.component')
            .then(m => m.AudioDashboardComponent),canActivate:[authGuard]
      },

      { path: 'videodashboard',
        loadComponent: () =>
          import('./content/episodes-dashboard/episodes-dashboard.component')
            .then(m => m.EpisodesDashboardComponent),canActivate:[authGuard]
      },

      { path: 'videodashboard/upload',
        loadComponent: () =>
          import('./content/episodes-dashboard/upload-studio/upload-studio.component')
            .then(m => m.UploadStudioComponent),
        canActivate:[authGuard], canDeactivate:[pendingUploadsGuard]
      },

      { path: 'ads',
        loadComponent: () =>
          import('./content/click-ads/click-ads.component')
            .then(m => m.ClickAdsComponent),canActivate:[authGuard]
      },

      { path: 'healthstories',
        loadComponent: () =>
          import('./content/health-stories/health-stories.component')
            .then(m => m.HealthStoriesComponent),canActivate:[authGuard]
      },

      { path: 'contentupload',
        loadComponent: () =>
          import('./content/content-upload/content-upload.component')
            .then(m => m.ContentUploadComponent),canActivate:[authGuard]
      },
      { path: 'learningmaterial',
        loadComponent: () =>
          import('./content/learning-material/learning-material.component')
            .then(m => m.LearningMaterialComponent),canActivate:[authGuard]
      },
      {path: 'communitymanager', loadComponent: () => import('./AppEngagement/community-manager/community-manager.component').then(m => m.CommunityManagerComponent), canActivate:[authGuard]},
      {path: 'category-dashboard', loadComponent: () => import('./content/category-dashboard/category-dashboard.component').then(m => m.CategoryDashboardComponent), canActivate:[authGuard]},
      {path: 'assigncategory', loadComponent: () => import('./content/series-dashboard/categoryassign/categoryassign.component').then(m => m.CategoryassignComponent), canActivate:[authGuard]},
      {path: 'seriesdashboard', loadComponent: () => import('./content/series-dashboard/series-dashboard.component').then(m => m.SeriesDashboardComponent), canActivate:[authGuard]},
      // {path: 'accessscreen', loadComponent: () => import('./content/access-screen/access-screen.component').then(m => m.AccessScreenComponent), canActivate:[authGuard]},
      // {path: 'tieraccessconfig', loadComponent: () => import('./content/tier-access-config/view-tier-access/view-tier-access.component').then(m => m.ViewTierAccessComponent), canActivate: [authGuard]},
      {path: 'viewparticipantstieraccess', loadComponent: () => import('./content/eiflix_tier/viewparticipant-tier-access/viewparticipant-tier-access.component').then(m => m.ViewparticipantTierAccessComponent), canActivate:[authGuard]},
      {path: 'playlistdashboard', loadComponent: () => import('./content/playlist-dashboard/playlist-dashboard.component').then(m => m.PlaylistDashboardComponent), canActivate:[authGuard], children:[
        {path: 'edit-playlist', loadComponent: () => import('./content/playlist-dashboard/playlist-configuration/playlist-configuration.component').then(m => m.PlaylistConfigurationComponent), canActivate: [authGuard]},
        {path: 'add-playlist', loadComponent: () => import('./content/playlist-dashboard/playlist-configuration/playlist-configuration.component').then(m => m.PlaylistConfigurationComponent), canActivate: [authGuard]},
      ]},
    ]
  },
  {path: 'content-upload-v2', loadComponent: () => import('./content-upload-version2/content-upload-version2.component').then(m => m.ContentUploadVersion2Component),canActivate:[authGuard]},
  {path: 'learningmaterial', loadComponent: () => import('./content/learning-material/learning-material.component').then(m => m.LearningMaterialComponent),canActivate:[authGuard]},
  {path: 'audiodashboard', loadComponent: () => import('./content/audio-dashboard/audio-dashboard.component').then(m => m.AudioDashboardComponent), canActivate:[authGuard]},
  {path: 'playlistdashboard', loadComponent: () => import('./content/playlist-dashboard/playlist-dashboard.component').then(m => m.PlaylistDashboardComponent), canActivate:[authGuard], children:[
    {path: 'edit-playlist', loadComponent: () => import('./content/playlist-dashboard/edit/edit.component').then(m => m.EditComponent), canActivate: [authGuard]},
    {path: 'add-playlist', loadComponent: () => import('./content/playlist-dashboard/solar-playlist/solar-playlist.component').then(m => m.SolarPlaylistComponent), canActivate: [authGuard]},
  ]},
  {path: 'playlistads', loadComponent: () => import('./content/playlist-ads/playlist-ads.component').then(m => m.PlaylistAdsComponent), canActivate:[authGuard]},
  {path: 'healthstories', loadComponent: () => import('./content/health-stories/health-stories.component').then(m => m.HealthStoriesComponent), canActivate:[authGuard]},
  {path: 'ads', loadComponent: () => import('./content/click-ads/click-ads.component').then(m => m.ClickAdsComponent), canActivate:[authGuard]},
  {path: 'queuevenue', loadComponent: () => import('./queue system/queue-venue/queue-venue.component').then(m => m.QueueVenueComponent), canActivate:[authGuard]},
  {path: 'dynamicstudio', loadComponent: () => import('./queue system/dynamic-studio-v2/dynamic-studio-v2.component').then(m => m.DynamicStudioV2Component), canActivate:[authGuard]},
  {path: 'view-participants-form', loadComponent: () => import('./Participants Profile Management/view-participants-form/view-participants-form.component').then(m => m.ViewParticipantsFormComponent), canActivate:[authGuard]},
  {path: 'videodashboard', loadComponent: () => import('./content/episodes-dashboard/episodes-dashboard.component').then(m => m.EpisodesDashboardComponent), canActivate:[authGuard]},
  {path: 'videodashboard/upload', loadComponent: () => import('./content/episodes-dashboard/upload-studio/upload-studio.component').then(m => m.UploadStudioComponent), canActivate:[authGuard], canDeactivate:[pendingUploadsGuard]},
  {path: 'contentanalytics', loadComponent: () => import('./content/content-analytics/content-analytics.component').then(m => m.ContentAnalyticsComponent), canActivate:[authGuard]},
  {path: 'content-analytics-dashboard', loadComponent: () => import('./content/content-analytics-dashboard/content-analytics-dashboard.component').then(m => m.ContentAnalyticsDashboardComponent), canActivate:[authGuard]},
  {path: 'accessscreen', loadComponent: () => import('./content/access-screen/access-screen.component').then(m => m.AccessScreenComponent), canActivate:[authGuard]},
  {path: 'seriesdashboard', loadComponent: () => import('./content/series-dashboard/series-dashboard.component').then(m => m.SeriesDashboardComponent), canActivate:[authGuard], children: [
    {path:'addseries', loadComponent: () => import('./content/series-dashboard/add-series/add-series.component').then(m => m.AddSeriesComponent), canActivate: [authGuard]},
    {path:'editseries', loadComponent: () => import('./content/series-dashboard/edit-series/edit-series.component').then(m => m.EditSeriesComponent), canActivate:[authGuard]},
  ]},
  {path: 'category-dashboard', loadComponent: () => import('./content/category-dashboard/category-dashboard.component').then(m => m.CategoryDashboardComponent), canActivate:[authGuard]},
  {path: 'zoomaccount', loadComponent: () => import('./queue system/zoom-account/zoom-account.component').then(m => m.ZoomAccountComponent), canActivate:[authGuard]},
  {path: 'arenastudioactivity', loadComponent: () => import('./queue system/arenastudioactivity/arenastudioactivity.component').then(m => m.ArenastudioactivityComponent), canActivate:[authGuard, roleGuard(['developer','admin','ah'])]},
  {path: 'queuetransfer', loadComponent: () => import('./queue system/queue-transfer/queue-transfer.component').then(m => m.QueueTransferComponent), canActivate:[authGuard]},
  {path: 'viewparticipantstieraccess', loadComponent: () => import('./content/eiflix_tier/viewparticipant-tier-access/viewparticipant-tier-access.component').then(m => m.ViewparticipantTierAccessComponent), canActivate:[authGuard]},
  {path: 'tieraccessconfig', loadComponent: () => import('./content/tier-access-config/view-tier-access/view-tier-access.component').then(m => m.ViewTierAccessComponent), canActivate: [authGuard]},
  {path: 'event_participation_approve', loadComponent: () => import('./Events/event-participation-approve/event-participation-approve.component').then(m => m.EventParticipationApproveComponent), canActivate: [authGuard]},
  {path: 'event-participation-confirmation', loadComponent: () => import('./Events/event-participation-confirmations/event-participation-confirmations.component').then(m => m.EventParticipationConfirmationsComponent), canActivate: [authGuard]},
  {path: 'events-stage-data', loadComponent: () => import('./Events/events-stage-data/events-stage-data.component').then(m => m.EventsStageDataComponent), canActivate: [authGuard]},
  {path: 'create_event', loadComponent: () => import('./Events/event-list/event-list.component').then(m => m.EventListComponent), canActivate: [authGuard]},
  {path: 'arena_e_ticket_approve', loadComponent: () => import('./Events/arena-e-ticket-approve/arena-e-ticket-approve.component').then(m => m.ArenaETicketApproveComponent), canActivate: [authGuard]},
  {path: 'qr-scanner', loadComponent: () => import('./Events/qr-scanner/qr-scanner.component').then(m => m.QrScannerComponent), canActivate: [authGuard]},
  {path: 'event_attendance_log', loadComponent: () => import('./Events/event-attendance-log/event-attendance-log.component').then(m => m.EventAttendanceLogComponent), canActivate: [authGuard]},
  {path: 'videoask-display', loadComponent: () => import('./Events/videoask-display/videoask-display.component').then(m => m.VideoaskDisplayComponent), canActivate:[authGuard]},
  {path: 'participantvideoask', loadComponent: () => import('./participant-videoask/participant-videoask.component').then(m => m.ParticipantVideoaskComponent), canActivate:[authGuard]},
  {path: 'overall_event_dashboard', loadComponent: () => import('./Events/live-event-dashboard/live-event-dashboard.component').then(m => m.LiveEventDashboardComponent), canActivate:[authGuard]},
  {path: 'live_event_dashboard', loadComponent: () => import('./Events/live-event-dashboard-v2/live-event-dashboard-v2.component').then(m => m.LiveEventDashboardV2Component), canActivate:[authGuard]},
  {path: 'first_timers_dashboard', loadComponent: () => import('./Events/first-timers-dashboard/first-timers-dashboard.component').then(m => m.FirstTimersDashboardComponent), canActivate:[authGuard]},
  {path: 'live_event_dashboard_v3', loadComponent: () => import('./Events/live-event-dashboard-v3/live-event-dashboard-v3.component').then(m => m.LiveEventDashboardV3Component), canActivate:[authGuard]},
  {path: 'contentupload', loadComponent: () => import('./content/content-upload/content-upload.component').then(m => m.ContentUploadComponent), canActivate: [authGuard]},
  {path: 'createarenavideoasktemplate', loadComponent: () => import('./content/arena-video-ask-input/arena-video-ask-input.component').then(m => m.ArenaVideoAskInputComponent), canActivate: [authGuard]},
  {path: 'locationlog', loadComponent: () => import('./Events/locationlog/locationlog.component').then(m => m.LocationlogComponent)},

  // Scheduling
  {path: 'EISzoom', loadComponent: () => import('./Scheduling/eis-zoom-account/eis-zoom-account.component').then(m => m.EISZoomAccountComponent), canActivate:[authGuard]},
  {path: 'appointmentavailability', loadComponent: () => import('./Scheduling/appointment-availability/appointment-availability.component').then(m => m.AppointmentAvailabilityComponent), canActivate:[authGuard]},
  {path: 'bookappointment', loadComponent: () => import('./Scheduling/book-appointment/book-appointment.component').then(m => m.BookAppointmentComponent), canActivate:[authGuard]},
  {path: 'appointmentcalendar', loadComponent: () => import('./Scheduling/appointment-calendar/appointment-calendar.component').then(m => m.AppointmentCalendarComponent), canActivate:[authGuard]},
  {path: 'mycalendar', loadComponent: () => import('./Scheduling/appointment-calendar/appointment-calendar.component').then(m => m.AppointmentCalendarComponent), canActivate:[authGuard]},
  {path: 'roster', loadComponent: () => import('./Scheduling/roaster/roaster.component').then(m => m.RoasterComponent), canActivate:[authGuard]},
  {path: 'appointmentstatuspending', loadComponent: () => import('./Scheduling/appointment-status-pending/appointment-status-pending.component').then(m => m.AppointmentStatusPendingComponent), canActivate:[authGuard]},
  {path: 'appointmentrole', loadComponent: () => import('./Scheduling/appointment-roles/appointment-roles.component').then(m => m.AppointmentRolesComponent), canActivate:[authGuard]},
  {path: 'eisappointmentrole', loadComponent: () => import('./Scheduling/eis-appointment-role/eis-appointment-role.component').then(m => m.EisAppointmentRoleComponent), canActivate:[authGuard]},
  {path: 'mapappointmentrole', loadComponent: () => import('./Scheduling/map-appointment-role/map-appointment-role.component').then(m => m.MapAppointmentRoleComponent), canActivate:[authGuard]},
  {path: 'mapclienteis', loadComponent: () => import('./Scheduling/map-client-eis/map-client-eis.component').then(m => m.MapClientEisComponent), canActivate:[authGuard]},
  {path: 'teamdeliveryhours', loadComponent: () => import('./Scheduling/team-delivery-hours/team-delivery-hours.component').then(m => m.TeamDeliveryHoursComponent), canActivate:[authGuard]},
  {path: 'offtime', loadComponent: () => import('./Offtime/offtime-list/offtime-list.component').then(m => m.OfftimeListComponent), canActivate:[authGuard]},
  {path: 'approveofftime', loadComponent: () => import('./Offtime/approve-offtime/approve-offtime.component').then(m => m.ApproveOfftimeComponent), canActivate:[authGuard]},
  {path: 'capacityutilization', loadComponent: () => import('./Scheduling/capacity-utilization/capacity-utilization.component').then(m => m.CapacityUtilizationComponent), canActivate:[authGuard]},
  {path: 'appointmentstudio', loadComponent: () => import('./Scheduling/appointment-studio/appointment-studio.component').then(m => m.AppointmentStudioComponent), canActivate:[authGuard]},
  {path: 'openappointmentzoom/:id', loadComponent: () => import('./Scheduling/appointment-zoom-view/appointment-zoom-view.component').then(m => m.AppointmentZoomViewComponent), canActivate:[authGuard]},
  {path: 'appointment-status-update', loadComponent: () => import('./Scheduling/appointment-zoom-view/appointment-status-update/appointment-status-update.component').then(m => m.AppointmentStatusUpdateComponent), canActivate:[authGuard]},

  // App Engagement
  {path: 'appactionpending', loadComponent: () => import('./AppEngagement/app-action-pending/app-action-pending.component').then(m => m.AppActionPendingComponent), canActivate: [authGuard]},
  {path: 'interimreportlog', loadComponent: () => import('./AppEngagement/interim-report-log/interim-report-log.component').then(m => m.InterimReportLogComponent), canActivate: [authGuard]},
  {path: 'evolutionwishlistlog', loadComponent: () => import('./AppEngagement/evolution-wishlist-log-screen/evolution-wishlist-log-screen.component').then(m => m.EvolutionWishlistLogScreenComponent), canActivate: [authGuard]},
  {path: 'evolutionwishlist', loadComponent: () => import('./AppEngagement/evolution-wishlist-form/evolution-wishlist-form.component').then(m => m.EvolutionWishlistFormComponent)},
  {path: 'modedashboard', loadComponent: () => import('./AppEngagement/mode-dashboard/mode-dashboard.component').then(m => m.ModeDashboardComponent), canActivate: [authGuard]},
  {path: 'mode-dashboard-new', loadComponent: () => import('./AppEngagement/mode-dashboard-new/mode-dashboard-new.component').then(m => m.ModeDashboardNewComponent), canActivate: [authGuard]},
  {path: 'participantAEL/:id', loadComponent: () => import('./AppEngagement/participant-ael/participant-ael.component').then(m => m.ParticipantAELComponent), canActivate: [authGuard]},
  {path: 'participantAEL', loadComponent: () => import('./AppEngagement/participant-ael/participant-ael.component').then(m => m.ParticipantAELComponent), canActivate: [authGuard]},
  {path: 'productmodeconfig', loadComponent: () => import('./AppEngagement/product-mode-config/product-mode-config.component').then(m => m.ProductModeConfigComponent), canActivate: [authGuard]},
  {path: 'communitymanager', loadComponent: () => import('./AppEngagement/community-manager/community-manager.component').then(m => m.CommunityManagerComponent), canActivate:[authGuard]},
  {path: 'recommendedplaylist', loadComponent: () => import('./AppEngagement/manage-recommended-playlist/manage-recommended-playlist-component').then(m => m.ManageRecommendedPlaylistComponent), canActivate: [authGuard]},
  {path: 'bigwall', loadComponent: () => import('./AppEngagement/bigwall-data-adding/bigwall-data-adding.component').then(m => m.BigwallDataAddingComponent), canActivate: [authGuard]},
  {path: 'arenadesigninsights', loadComponent: () => import('./arena-design-insights/arena-design-insights.component').then(m => m.ArenaDesignInsightsComponent)},
  {path: 'atctaxonomy', loadComponent: () => import('./AppEngagement/taxonomy/view-tags/view-tags.component').then(m => m.ViewTagsComponent), canActivate: [authGuard]},
  {path: 'layers-screen', loadComponent: () => import('./Events/layers-screen/layers-screen.component').then(m => m.LayersScreenComponent), canActivate: [authGuard]},
  {path: 'viewUpgradedATC', loadComponent: () => import('./ATC/view-upgraded-atc/view-upgraded-atc.component').then(m => m.ViewUpgradedAtcComponent), canActivate: [authGuard]},
  {path: 'atctrajectory', loadComponent: () => import('./ATC/eit-education-atc/eit-education-atc.component').then(m => m.EitEducationAtcComponent), canActivate:[authGuard]},
  {path: 'createworkshop', loadComponent: () => import('./Workshop/eiflix-workshop/view-workshop/view-workshop.component').then(m => m.ViewWorkshopComponent), canActivate: [authGuard]},
  {path: 'quiz', loadComponent: () => import('./quiz/quizscreen.component').then(m => m.QuizScreenComponent),canActivate: [authGuard]},
  {path: 'viewquiz', loadComponent: () => import('./quiz/viewquizcohort/viewquizcohort.component').then(m => m.ViewquizcohortComponent),canActivate: [authGuard]},


  // Queue System
  {path: 'initiateeventproduct', loadComponent: () => import('./queue system/initiate-event-product/initiate-event-product.component').then(m => m.InitiateEventProductComponent), canActivate: [authGuard]},
  {path: 'queue-planner', loadComponent: () => import('./queue system/queue-planning/queue-planning.component').then(m => m.QueuePlanningComponent), canActivate: [authGuard]},
  {path: 'queue-planner-review', loadComponent: () => import('./queue system/queue-planning-review/queue-planning-review.component').then(m => m.QueuePlanningReviewComponent), canActivate: [authGuard]},
  {path: 'queuebigplanner', loadComponent: () => import('./queue system/big-planner/big-planner.component').then(m => m.BigPlannerComponent), canActivate: [authGuard]},
  // {path: 'dynamicqueuemanager', loadComponent: () => import('./queue system/dynamic-queue-manager/dynamic-queue-manager.component').then(m => m.DynamicQueueManagerComponent), canActivate: [authGuard]},
  {path: 'dynamicqueuemanager', loadComponent: () => import('./queue system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component').then(m => m.DynamicQueueManagerCloneComponent), canActivate: [authGuard]},
  {path: 'openmeeting/:id/:collectiontype', loadComponent: () => import('./queue system/zoom-clientview/zoom-clientview.component').then(m => m.ZoomClientviewComponent), canActivate:[authGuard]},
  {path: 'viewrubrics_scoring_atc', loadComponent: () => import('./queue system/atc-generated-from-queue-stage/atc-generated-from-queue-stage.component').then(m => m.AtcGeneratedFromQueueStageComponent), canActivate:[authGuard]},

  // ATC
  {path: 'prescribeATC', loadComponent: () => import('./ATC/prescribe-atc/prescribe-atc.component').then(m => m.PrescribeATCComponent), canActivate: [authGuard]},
  {path: 'editATC/:atc/:type', loadComponent: () => import('./ATC/edit-atc/edit-atc.component').then(m => m.EditAtcComponent), canActivate: [authGuard]},
  {path: 'previewATC', loadComponent: () => import('./ATC/atc-preview/atc-preview.component').then(m => m.AtcPreviewComponent), canActivate: [authGuard]},
  {path: 'viewprescribedATC', loadComponent: () => import('./ATC/view-prescribed-atc/view-prescribed-atc.component').then(m => m.ViewPrescribedATCComponent), canActivate: [authGuard]},
  {path: 'view-participant-atc', loadComponent: () => import('./ATC/view-participant-atc/view-participant-atc.component').then(m => m.ViewParticipantAtcComponent)},
  {path: 'viewassignedATC', loadComponent: () => import('./ATC/view-assigned-atc/view-assigned-atc.component').then(m => m.ViewAssignedATCComponent), canActivate: [authGuard]},
  {path: 'reviewflagATC', loadComponent: () => import('./ATC/review-flag-atc/review-flag-atc.component').then(m => m.ReviewFlagATCComponent), canActivate: [authGuard]},
  {path: 'pickformentoring', loadComponent: () => import('./ATC/pick-for-mentoring/pick-for-mentoring.component').then(m => m.PickForMentoringComponent), canActivate:[authGuard]},
  {path: 'liveprescription/:draft', loadComponent: () => import('./ATC/live-prescription/live-prescription.component').then(m=>m.LivePrescriptionComponent), canActivate:[authGuard]},

  // Triple ATC
  {path: 'addtripleATC', loadComponent: () => import('./ATC/Triple ATC/add-triple-atc/add-triple-atc.component').then(m => m.AddTripleATCComponent), canActivate:[authGuard]},
  {path: 'viewtripleATC', loadComponent: () => import('./ATC/Triple ATC/view-triple-atc/view-triple-atc.component').then(m => m.ViewTripleATCComponent), canActivate:[authGuard]},
  {path: 'previewtripleATC', loadComponent: () => import('./ATC/Triple ATC/preview-triple-atc/preview-triple-atc.component').then(m => m.PreviewTripleATCComponent), canActivate:[authGuard]},
  {path: 'edittripleATC/:atc', loadComponent: () => import('./ATC/Triple ATC/edit-triple-atc/edit-triple-atc.component').then(m => m.EditTripleATCComponent), canActivate:[authGuard]},

  // Workshop
  {path: 'workshopchallengecreation', loadComponent: () => import('./Workshop/challenge-view/challenge-view.component').then(m => m.ChallengeViewComponent), canActivate: [authGuard]},
  {path: 'enrollment_config_view', loadComponent: () => import('./Workshop/enrollment-config-view/enrollment-config-view.component').then(m => m.EnrollmentConfigViewComponent), canActivate:[authGuard]},
  {path: 'workshopchallengeparticipantdashboard', loadComponent: () => import('./Workshop/participant-enrollment-dashboard/participant-enrollment-dashboard.component').then(m => m.ParticipantEnrollmentDashboardComponent), canActivate:[authGuard]},
  {path: 'workshop_image_upload', loadComponent: () => import('./Workshop/workshop-image-upload/workshop-image-upload.component').then(m => m.WorkshopImageUploadComponent), canActivate:[authGuard]},

  // Customer Support
  { path: 'customersupportdashboard', loadComponent: () => import('./Customer Support/customer-support-dashboard/customer-support-dashboard.component').then(m => m.CustomerSupportDashboardComponent), canActivate: [authGuard] },
  { path: 'customersupportdashboard/ticket/:ticketid/:ticketno', loadComponent: () => import('./Customer Support/customer-chat-screen/customer-chat-screen.component').then(m => m.CustomerChatScreenComponent), canActivate: [authGuard] },
  {path: 'customer-support-tickets', loadComponent: () => import('./Customer Support/customer-ticket-new/customer-ticket-new.component').then(m => m.CustomerTicketNewComponent), canActivate: [authGuard]},
  {path: 'customertickets', loadComponent: () => import('./Customer Support/customertickets/customertickets.component').then(m => m.CustomerticketsComponent), canActivate:[authGuard]},

  // Journey Onboarding
  {path: 'salesleads', loadComponent: () => import('./Journey Onboarding/saleslead/saleslead.component').then(m => m.SalesleadComponent), canActivate:[authGuard]},
  {path: 'sales-numbers', loadComponent: () => import('./Journey Onboarding/sales-numbers/sales-numbers.component').then(m => m.SalesNumbersComponent), canActivate:[authGuard]},
  {path: 'sales-teams', loadComponent: () => import('./Journey Onboarding/sales-teams/sales-teams.component').then(m => m.SalesTeamsComponent), canActivate:[authGuard]},
  {path: 'onboardingremarks', loadComponent: () => import('./Journey Onboarding/onboarding-remark/onboarding-remark.component').then(m => m.OnboardingRemarkComponent), canActivate: [authGuard]},
  {path: 'opportunities', loadComponent: () => import('./Journey Onboarding/journeycoach-opportunities/journeycoach-opportunities.component').then(m => m.JourneycoachOpportunitiesComponent), canActivate: [authGuard]},
  {path: 'JourneycoachDashboard-new', loadComponent: () => import('./Journey Onboarding/journeycoach-dashboard/journeycoach-dashboard.component').then(m => m.JourneycoachDashboardComponent), canActivate:[authGuard]},
  {path: 'productinitiated-dashboard', loadComponent: () => import('./Journey Onboarding/product-initiation-dashboard/product-initiation-dashboard.component').then(m => m.ProductInitiationDashboardComponent), canActivate:[authGuard]},
  {path: 'delivery-dashboard', loadComponent: () => import('./Journey Onboarding/delivery-dashboard-clone/delivery-dashboard-clone.component').then(m => m.DeliveryDashboardCloneComponent), canActivate:[authGuard]},
  {path: 'overall-dashboard', loadComponent: () => import('./Journey Onboarding/overall-dashboard/overall-dashboard.component').then(m => m.OverallDashboardComponent), canActivate:[authGuard]},
  {path: 'journey-coach-health', loadComponent: () => import('./Journey Onboarding/journey-coach-health-dashboard/journey-coach-health-dashboard.component').then(m => m.JourneyCoachHealthDashboardComponent), canActivate:[authGuard]},
  {path: 'sales-report', loadComponent: () => import('./Journey Onboarding/sales-dashboard-clone/sales-dashboard-clone.component').then(m => m.SalesDashboardCloneComponent), canActivate:[authGuard]},
  {path: 'ecosystem', loadComponent: () => import('./Journey Onboarding/eco-system-new/eco-system-new.component').then(m => m.EcoSystemNewComponent), canActivate: [authGuard]},
  {path: 'onboarding-pipeline', loadComponent: () => import('./Journey Onboarding/onboarding-pipeline/onboarding-pipeline.component').then(m => m.OnboardingPipelineComponent), canActivate: [authGuard]},

  // Participants Profile Management
  {path: 'participants-analytics', loadComponent: () => import('./Participants Profile Management/participants-analytics/participants-analytics.component').then(m => m.ParticipantsAnalyticsComponent), canActivate: [authGuard]},
  {path: 'participant-evolution-summary', loadComponent: () => import('./Participants Profile Management/participants-analytics/participants-evolution-summary/participants-evolution-summary.component').then(m => m.ParticipantsEvolutionSummaryComponent), canActivate:[authGuard]},
  {path: 'participant-form-tracker', loadComponent: () => import('./Participants Profile Management/participant-form-tracker/participant-form-tracker.component').then(m => m.ParticipantFormTrackerComponent), canActivate:[authGuard]},

  // BIG
  {path: 'big-dashboard', loadComponent: () => import('./big/big-dashboard/big-dashboard.component').then(m => m.BigDashboardComponent), canActivate:[authGuard]},
  {path: 'bigchatscreen', loadComponent: () => import('./big/big-chat-screen/big-chat-screen.component').then(m => m.BigChatScreenComponent), canActivate:[authGuard]},
  {path: 'formbasedsubmission', loadComponent: () => import('./big/form-based-submission/form-based-submission.component').then(m => m.FormBasedSubmissionComponent), canActivate:[authGuard]},
  {path: 'bigProfile', loadComponent: () => import('./big/big-profile/big-profile.component').then(m => m.BigProfileComponent), canActivate:[authGuard]},
  {path: 'particiant_assignment_board', loadComponent: () => import('./big/participant-assignment-board/participant-assignment-board.component').then(m => m.ParticipantAssignmentBoardComponent), canActivate: [authGuard]},
  {path: 'zoommeeting_bigparticipants', loadComponent: () => import('./big/zoom-meeting/zoom-meeting.component').then(m => m.ZoomMeetingComponent), canActivate: [authGuard]},
  {path: 'bigcohorts', loadComponent: () => import('./big/big-cohort-clone-2/big-cohort-clone-2.component').then(m => m.BigCohortClone2Component), canActivate: [authGuard]},
  {path: 'manualassignment', loadComponent: () => import('./big/manual-assignments/manual-assignments.component').then(m => m.ManualAssignmentsComponent), canActivate: [authGuard]},
  {path: 'validateParticipantAssignments', loadComponent: () => import('./big/validate-participants-assignment/validate-participants-assignment.component').then(m => m.ValidateParticipantsAssignmentComponent), canActivate: [authGuard]},
  {path: 'biglevel', loadComponent: () => import('./big/big-level/big-level.component').then(m => m.BigLevelComponent), canActivate: [authGuard]},
  {path: 'modellevelconfig', loadComponent: () => import('./big/atcmodel-level-config/atcmodel-level-config.component').then(m => m.AtcmodelLevelConfigComponent), canActivate: [authGuard]},
  {path: 'bigaggregateeventlevel', loadComponent: () => import('./big/big-aggregate-event-level/big-aggregate-event-level.component').then(m => m.BigAggregateEventLevelComponent), canActivate: [authGuard]},
  {path: 'bigactivitymonitor', loadComponent: () => import('./big/monitor-activity-log/monitor-activity-log.component').then(m => m.MonitorActivityLogComponent), canActivate: [authGuard]},
  {path: 'big_aggregate', loadComponent: () => import('./big/big-aggregate/big-aggregate.component').then(m => m.BigAggregateComponent), canActivate:[authGuard]},
  {path: 'bigactivity', loadComponent: () => import('./big/big-activity/big-activity.component').then(m => m.BigActivityComponent), canActivate:[authGuard]},
  {path: 'arena_space', loadComponent: () => import('./big/create-arena-space/create-arena-space.component').then(m => m.CreateArenaSpaceComponent), canActivate:[authGuard]},
  {path: 'bigactivitylog', loadComponent: () => import('./big/big-activity-log/big-activity-log.component').then(m => m.BigActivityLogComponent), canActivate:[authGuard]},

  // Notifications
  {path: 'notificationlog', loadComponent: () => import('./AppEngagement/notifications-log/notifications-log.component').then(m => m.NotificationsLogComponent), canActivate:[authGuard]},
  {path: 'notificationrecord', loadComponent: () => import('./AppEngagement/notification-record/notification-record.component').then(m => m.NotificationRecordComponent), canActivate:[authGuard]},

  // Chat
  {path: 'group-chat', loadComponent: () => import('./Events/Chat/chat-screen/chat-screen.component').then(m => m.ChatScreenComponent), canActivate:[authGuard]},

  // Communication Center
  {path: 'zoom-recording-dashboard', loadComponent: () => import('./Communication Center/zoom-recording-dashboard/zoom-recording-dashboard.component').then(m => m.ZoomRecordingDashboardComponent), canActivate:[authGuard]},
  {path: 'email-templates', loadComponent: () => import('./Communication Center/create-email-template/create-email-template.component').then(m => m.CreateEmailTemplateComponent), canActivate:[authGuard]},
  {path: 'communication', loadComponent: () => import('./Communication Center/communication/communication.component').then(m => m.CommunicationComponent), canActivate:[authGuard]},

  // New Workshop
  {path: 'create-workshop', loadComponent: () => import('./New-Workshop/create-workshop/create-workshop.component').then(m => m.CreateWorkshopComponent)},
  {path: 'workshopconfig/:id', loadComponent: () => import('./New-Workshop/workshop-configuration/workshop-configuration.component').then(m => m.WorkshopConfigurationComponent)},
  {path: 'workshops', loadComponent: () => import('./New-Workshop/workshops/workshops.component').then(m => m.WorkshopsComponent),canActivate:[authGuard]},
  {path: 'eiflixhomeconfig', loadComponent: () => import('./New-Workshop/upcomingworkshops/upcomingworkshops.component').then(m => m.UpcomingworkshopsComponent)},
  {path: 'newusersprofile', loadComponent: () => import('./New-Workshop/newusersprofile/newusersprofile.component').then(m => m.NewusersprofileComponent)},
  {path: 'eiflixdiscoverpage', loadComponent: () => import('./New-Workshop/eiflixdiscoverpage/eiflixdiscoverpage.component').then(m => m.EiflixdiscoverpageComponent)},
  {path: 'workshop_dashboard/:id', loadComponent: () => import('./New-Workshop/workshop-dashboard/workshop-dashboard.component').then(m => m.WorkshopDashboardComponent), canActivate:[authGuard]},
  {path: 'formtemplateworkshop', loadComponent: () => import('./New-Workshop/form-assignment/form-assignment.component').then(m => m.FormAssignmentComponent)},
  {path: 'productpageworkshop', loadComponent: () => import('./New-Workshop/product-page/product-page.component').then(m => m.ProductPageComponent),canActivate:[authGuard]},
  {path: 'engagementdashboard', loadComponent: () => import('./New-Workshop/engagement-dashboard/engagement-dashboard.component').then(m => m.EngagementDashboardComponent),canActivate:[authGuard]},
  {path: 'bigengagementdashboard', loadComponent: () => import('./New-Workshop/capacity-dashboard/capacity-dashboard.component').then(m => m.CapacityDashboardComponent),canActivate:[authGuard]},
  {path: 'bigeventmentor', loadComponent: () => import('./New-Workshop/bigeventmentor/bigeventmentor.component').then(m => m.BigeventmentorComponent),canActivate:[authGuard]},
  {path: 'eiflixoperationsdashboard', loadComponent: () => import('./New-Workshop/eiflixoperationsdashboard/eiflixoperationsdashboard.component').then(m => m.EiflixoperationsdashboardComponent),canActivate:[authGuard]},
  {path: 'campaigndashboard', loadComponent: () => import('./New-Workshop/campaigndashboard/campaigndashboard.component').then(m => m.CampaigndashboardComponent)},
  {path: 'wccalendar', loadComponent: () => import('./New-Workshop/wccalendar/wccalendar.component').then(m => m.WccalendarComponent)},
  
  // Evolution Mapping
  {path: 'evolutionmapping', loadComponent: () => import('./EvolutionMapping/evolution-mapping/evolution-mapping.component').then(m => m.EvolutionMappingComponent), canActivate:[authGuard]},
  {path: 'participant_videos_mapping', loadComponent: () => import('./EvolutionMapping/evolution-mapping-new/evolution-mapping-new.component').then(m => m.EvolutionMappingNewComponent), canActivate:[authGuard]},
  {path: 'participantevolution', loadComponent: () => import('./EvolutionMapping/evolution-mapping/participant-evolution-mapping/participant-evolution-mapping.component').then(m => m.ParticipantEvolutionMappingComponent), canActivate:[authGuard]},
  // Taxonomy
  {path: 'updateprofiletaxonomy', loadComponent: () => import('./AppEngagement/taxonomy/update-adjustment-taxonomy/update-adjustment-taxonomy.component').then(m => m.UpdateAdjustmentTaxonomyComponent), canActivate:[authGuard]},

  // Participant Touchpoint
  {path: 'participanttouchpoint', loadComponent: () => import('./participant-touchpoint/participant-touchpoint.component').then(m => m.ParticipantTouchpointComponent), canActivate:[authGuard]},

  // TV Auth
  {path: 'tv-auth', loadComponent: () => import('./tv-auth.component').then(m => m.TvAuthComponent)},

  // HPC
  {path: 'hpc', loadComponent: () => import('./hpc/hpc.component').then(m => m.HPCComponent), canActivate:[authGuard]},

  // Main Dashboard (lazy loaded)
  {path: 'EISDashboard', loadComponent: () => import('./main-dashboard/main-dashboard.component').then(m => m.MainDashboardComponent), canActivate:[authGuard]},

  // Business Dashboard
  {path: 'expense-planner/:tab', loadComponent: () => import('./Business Dashboard/expense-planner/expense-planner.component').then(m => m.ExpensePlannerComponent), canActivate: [authGuard]},
  {path: 'ads-entry', loadComponent: () => import('./Business Dashboard/AdsEntry/entry-management.component').then(m => m.EntryManagementComponent), canActivate:[authGuard]},
  {path: 'profile-role-access', loadComponent: () => import('./Business Dashboard/profile-based-access/profile-based-access.component').then(m => m.ProfileBasedAccessComponent), canActivate:[authGuard]},

  // OpenVidu
  {path: 'monitorliveassignment', loadComponent: () => import('./OpenVidu/monitor-liveassignment/monitor-liveassignment.component').then(m => m.MonitorLiveassignmentComponent), canActivate: [authGuard]},
  {path: 'joinroom/:roomid', loadComponent: () => import('./OpenVidu/join-openvidu-call/join-openvidu-call.component').then(m => m.JoinOpenviduCallComponent), canActivate: [authGuard]},

  // LiveKit (new call flow with DeepFilterNet3 client-side noise suppression)
  {path: 'joinlivekit/:roomid', loadComponent: () => import('./LiveKit/join-livekit-call/join-livekit-call.component').then(m => m.JoinLivekitCallComponent), canActivate: [authGuard]},
  {path: 'participantstudio', loadComponent: () => import('./OpenVidu/list-openvidu-room/list-openvidu-room.component').then(m => m.ListOpenviduRoomComponent), canActivate: [authGuard]},
  {path: 'openvidurecordings', loadComponent: () => import('./OpenVidu/openvidu-recording/openvidu-recording.component').then(m => m.OpenviduRecordingComponent), canActivate: [authGuard]},

  // Health System
  {path: 'queueeventhealth', loadComponent: () => import('./Diagnostics Tool/queue-event-health/queue-event-health.component').then(m => m.QueueEventHealthComponent), canActivate: [authGuard]},
  {path: 'liveeventhealth', loadComponent: () => import('./Diagnostics Tool/live-event-health/live-event-health.component').then(m => m.LiveEventHealthComponent), canActivate: [authGuard]},

  {path: 'ahcrm',loadComponent: () => import('./AppEngagement/ahcrm_home/participant-list/participant-list.component').then(m => m.ParticipantListComponent), canActivate: [authGuard] },

  {path: 'eventzonemanagement',loadComponent: () => import('./Zone Management/event-zone-management/event-zone-management.component').then(m => m.EventZoneManagementComponent), canActivate: [authGuard] },

  {path: 'channel-templates',loadComponent: () => import('./Channel Communication/channeltemplates/channeltemplates.component').then(m => m.ChannelTemplatesComponent),canActivate: [authGuard]},

  // ai generated atc view screen
  {path: 'viewaigeneratedatc', loadComponent: () => import('./view-ai-generated-atc/view-ai-generated-atc.component').then(m => m.ViewAiGeneratedAtcComponent), canActivate: [authGuard]},

  //Vadivel
  {path: 'appointment-dashboard', loadComponent: () => import('./appointment-dashboard/appointment-dashboard.component').then(m => m.AppointmentDashboardComponent), canActivate: [authGuard]},

  //ecosystem
  {path: 'ecosystem', loadComponent: () => import('./Journey Onboarding/eco-system-new/eco-system-new.component').then(m => m.EcoSystemNewComponent), canActivate: [authGuard]},

  //queue-web
  {path: 'queue-web', loadComponent: () => import('./queue system/QueueWebVerison1/queue-web-version1.component').then(m => m.QueueWebVersion1Component), canActivate: [authGuard] },
  {path: 'evolution-prep-participants', loadComponent: () => import('./queue system/evolution-prep-participants/evolution-prep-participants.component').then(m => m.EvolutionPrepParticipantsComponent), canActivate: [authGuard]},
  {path: 'evolution-prep-participants-v2', loadComponent: () => import('./queue system/evolution-prep-participants-v2/evolution-prep-participants-v2.component').then(m => m.EvolutionPrepParticipantsV2Component), canActivate: [authGuard]},

  // Dev - Test
  {path: 'devtestmic', loadComponent: () => import('./Test Component/dev-test-mic/dev-test-mic.component').then(m => m.DevTestMicComponent) },

  // ATC generation pipeline ops
  {path: 'queue-atc-generation', loadComponent: () => import('./ATC-Ops/atc-generation-ops/atc-generation-ops.component').then(m => m.AtcGenerationOpsComponent), canActivate: [authGuard]},
  {path: 'queue-atc-usage', loadComponent: () => import('./ATC-Ops/atc-usage-dashboard/atc-usage-dashboard.component').then(m => m.AtcUsageDashboardComponent), canActivate: [authGuard]},

  // Wildcard must stay LAST — it catches every unmatched path
  {path: '**',loadComponent: () =>import('./exceptionalrouting/exceptionalrouting.component').then(m => m.ExceptionalroutingComponent)},
];

// import { Routes } from '@angular/router';
// import { authGuard } from './auth.guard';
// import { LoginComponent } from './login/login.component';
// import { AddjourneyComponent } from './Product Designer/addjourney/addjourney.component';
// import { MainDashboardComponent } from './main-dashboard/main-dashboard.component';
// import { AddpackageComponent } from './Product Designer/addpackage/addpackage.component';
// import { PackageDesignComponent } from './Product Designer/package-design/package-design.component';
// import { DeliverySetComponent } from './Product Designer/delivery-set/delivery-set.component';
// import { FormtemplateComponent } from './Product Designer/delivery-set/formtemplate/formtemplate.component';
// import { ViewAtcmodelComponent } from './Product Designer/product-atcmodel/view-atcmodel/view-atcmodel.component';
// import { JourneyProductComponent } from './Product Designer/journey-product/journey-product/journey-product.component';
// import { CreateAelNamesComponent } from './Product Designer/create-ael-names/create-ael-names.component';
// import { AddProductComponent } from './Product Designer/add-product/add-product.component';
// import { ViewProductModePlaylistComponent } from './Product Designer/view-product-mode-playlist/view-product-mode-playlist.component';
// import { ProductDeliveryComponent } from './Product Designer/product-delivery/product-delivery.component';
// import { DeliverySequenceComponent } from './Product Designer/delivery-sequence/delivery-sequence.component';
// import { RouteConfigurationComponent } from './route-configuration/route-configuration.component';
// import { ProfilelistComponent } from './Participants Profile Management/profilelist/profilelist.component';
// import { UserprofileComponent } from './Participants Profile Management/userprofile/userprofile.component';
// import { AudioDashboardComponent } from './content/audio-dashboard/audio-dashboard.component';
// import { PlaylistDashboardComponent } from './content/playlist-dashboard/playlist-dashboard.component';
// import { EditComponent } from './content/playlist-dashboard/edit/edit.component';
// import { SolarPlaylistComponent } from './content/playlist-dashboard/solar-playlist/solar-playlist.component';
// import { PlaylistAdsComponent } from './content/playlist-ads/playlist-ads.component';
// import { HealthStoriesComponent } from './content/health-stories/health-stories.component';
// import { ClickAdsComponent } from './content/click-ads/click-ads.component';
// import { EventOpportunityDashboardComponent } from './queue system/event-opportunity-dashboard/event-opportunity-dashboard.component';
// import { QueueListComponent } from './queue system/queue-list/queue-list.component';
// import { QueueVenueComponent } from './queue system/queue-venue/queue-venue.component';
// import { DynamicStudioComponent } from './queue system/dynamic-studio/dynamic-studio.component';
// import { ViewParticipantsFormComponent } from './Participants Profile Management/view-participants-form/view-participants-form.component';
// import { AccessScreenComponent } from './content/access-screen/access-screen.component';
// import { ViewparticipantTierAccessComponent } from './content/eiflix_tier/viewparticipant-tier-access/viewparticipant-tier-access.component';
// import { EpisodesDashboardComponent } from './content/episodes-dashboard/episodes-dashboard.component';
// import { AddSeriesComponent } from './content/series-dashboard/add-series/add-series.component';
// import { EditSeriesComponent } from './content/series-dashboard/edit-series/edit-series.component';
// import { SeriesDashboardComponent } from './content/series-dashboard/series-dashboard.component';
// import { ContentAnalyticsComponent } from './content/content-analytics/content-analytics.component';
// import { ViewTierAccessComponent } from './content/tier-access-config/view-tier-access/view-tier-access.component';
// import { ContentUploadComponent } from './content/content-upload/content-upload.component';
// import { ArenaVideoAskInputComponent } from './content/arena-video-ask-input/arena-video-ask-input.component';
// import { EISZoomAccountComponent } from './Scheduling/eis-zoom-account/eis-zoom-account.component';
// import { AppointmentAvailabilityComponent } from './Scheduling/appointment-availability/appointment-availability.component';
// import { BookAppointmentComponent } from './Scheduling/book-appointment/book-appointment.component';
// import { AppointmentCalendarComponent } from './Scheduling/appointment-calendar/appointment-calendar.component';
// import { RoasterComponent } from './Scheduling/roaster/roaster.component';
// import { AppointmentStatusPendingComponent } from './Scheduling/appointment-status-pending/appointment-status-pending.component';
// import { AppointmentRolesComponent } from './Scheduling/appointment-roles/appointment-roles.component';
// import { EisAppointmentRoleComponent } from './Scheduling/eis-appointment-role/eis-appointment-role.component';
// import { MapAppointmentRoleComponent } from './Scheduling/map-appointment-role/map-appointment-role.component';
// import { MapClientEisComponent } from './Scheduling/map-client-eis/map-client-eis.component';
// import { BigDashboardComponent } from './big/big-dashboard/big-dashboard.component';
// import { CreateMarathonComponent } from './big/create-marathon/create-marathon.component';
// import { BigProfileComponent } from './big/big-profile/big-profile.component';
// import { TeamDeliveryHoursComponent } from './Scheduling/team-delivery-hours/team-delivery-hours.component';
// import { OfftimeListComponent } from './Offtime/offtime-list/offtime-list.component';
// import { ApproveOfftimeComponent } from './Offtime/approve-offtime/approve-offtime.component';
// import { CapacityUtilizationComponent } from './Scheduling/capacity-utilization/capacity-utilization.component';

// import { AppActionPendingComponent } from './AppEngagement/app-action-pending/app-action-pending.component';
// import { AddPendingActionComponent } from './AppEngagement/app-action-pending/add-pending-action/add-pending-action.component';
// import { InterimReportLogComponent } from './AppEngagement/interim-report-log/interim-report-log.component';
// import { EvolutionWishlistLogScreenComponent } from './AppEngagement/evolution-wishlist-log-screen/evolution-wishlist-log-screen.component';
// import { ModeDashboardComponent } from './AppEngagement/mode-dashboard/mode-dashboard.component';
// import { ProductModeConfigComponent } from './AppEngagement/product-mode-config/product-mode-config.component';
// import { ProductModeConfigupdateComponent } from './AppEngagement/product-mode-config/product-mode-configupdate/product-mode-configupdate.component';
// import { ParticipantAELComponent } from './AppEngagement/participant-ael/participant-ael.component';
// import { ReviewParticipantAELComponent } from './AppEngagement/participant-ael/review-participant-ael/review-participant-ael.component';
// import { CommunityManagerComponent } from './AppEngagement/community-manager/community-manager.component';
// import { ManageRecommendedPlaylistComponent } from './AppEngagement/manage-recommended-playlist/manage-recommended-playlist-component';
// import { BigwallDataAddingComponent } from './AppEngagement/bigwall-data-adding/bigwall-data-adding.component';
// import { ViewTagsComponent } from './AppEngagement/taxonomy/view-tags/view-tags.component';

// import { LayersScreenComponent } from './Events/layers-screen/layers-screen.component';
// import { AddLayersComponent } from './Events/layers-screen/add-layers/add-layers.component';
// import { CreateGroupDialogComponent } from './Events/Chat/create-group-dialog/create-group-dialog.component';
// import { ViewUpgradedAtcComponent } from './ATC/view-upgraded-atc/view-upgraded-atc.component';
// import { EitEducationAtcComponent } from './ATC/eit-education-atc/eit-education-atc.component';
// import { SelectValidatorComponent } from './DialogBox/select-validator/select-validator.component';
// import { ViewWorkshopComponent } from './Workshop/eiflix-workshop/view-workshop/view-workshop.component';
// import { AddWorkshopComponent } from './Workshop/eiflix-workshop/add-workshop/add-workshop.component';

// import { InitiateEventProductComponent } from './queue system/initiate-event-product/initiate-event-product.component';
// import { BigPlannerComponent } from './queue system/big-planner/big-planner.component';
// import { DynamicQueueManagerComponent } from './queue system/dynamic-queue-manager/dynamic-queue-manager.component';
// import { PrescribeATCComponent } from './ATC/prescribe-atc/prescribe-atc.component';
// import { ViewPrescribedATCComponent } from './ATC/view-prescribed-atc/view-prescribed-atc.component';
// import { ViewAssignedATCComponent } from './ATC/view-assigned-atc/view-assigned-atc.component';
// import { ChallengeViewComponent } from './Workshop/challenge-view/challenge-view.component';
// import { CustomerSupportDashboardComponent } from './Customer Support/customer-support-dashboard/customer-support-dashboard.component';
// import { EventParticipationApproveComponent } from './Events/event-participation-approve/event-participation-approve.component';
// import { EventListComponent } from './Events/event-list/event-list.component';
// import { ArenaETicketApproveComponent } from './Events/arena-e-ticket-approve/arena-e-ticket-approve.component';
// import { QrScannerComponent } from './Events/qr-scanner/qr-scanner.component';
// import { EventAttendanceLogComponent } from './Events/event-attendance-log/event-attendance-log.component';
// import { VideoaskDisplayComponent } from './Events/videoask-display/videoask-display.component';
// import { LiveEventDashboardComponent } from './Events/live-event-dashboard/live-event-dashboard.component';
// import { SalesleadComponent } from './Journey Onboarding/saleslead/saleslead.component';
// import { OnboardingRemarkComponent } from './Journey Onboarding/onboarding-remark/onboarding-remark.component';
// import { JourneycoachOpportunitiesComponent } from './Journey Onboarding/journeycoach-opportunities/journeycoach-opportunities.component';
// import { ProfileSummaryComponent } from './Participants Profile Management/profile-summary/profile-summary.component';
// import { ParticipantsAnalyticsComponent } from './Participants Profile Management/participants-analytics/participants-analytics.component';
// import { EnrollmentConfigViewComponent } from './Workshop/enrollment-config-view/enrollment-config-view.component';
// import { ReviewFlagATCComponent } from './ATC/review-flag-atc/review-flag-atc.component';
// import { PickForMentoringComponent } from './ATC/pick-for-mentoring/pick-for-mentoring.component';
// import { AddTripleATCComponent } from './ATC/Triple ATC/add-triple-atc/add-triple-atc.component';
// import { ViewTripleATCComponent } from './ATC/Triple ATC/view-triple-atc/view-triple-atc.component';
// import { EditTripleATCComponent } from './ATC/Triple ATC/edit-triple-atc/edit-triple-atc.component';
// import { ParticipantAssignmentBoardComponent } from './big/participant-assignment-board/participant-assignment-board.component';
// import { ZoomMeetingComponent } from './big/zoom-meeting/zoom-meeting.component';
// import { BigCohortsComponent } from './big/big-cohorts/big-cohorts.component';
// import { ManualAssignmentsComponent } from './big/manual-assignments/manual-assignments.component';
// import { ValidateParticipantsAssignmentComponent } from './big/validate-participants-assignment/validate-participants-assignment.component';
// import { BigLevelComponent } from './big/big-level/big-level.component';
// import { AtcmodelLevelConfigComponent } from './big/atcmodel-level-config/atcmodel-level-config.component';
// import { BigAggregateEventLevelComponent } from './big/big-aggregate-event-level/big-aggregate-event-level.component';
// import { MonitorActivityLogComponent } from './big/monitor-activity-log/monitor-activity-log.component';
// import { ParticipantEnrollmentDashboardComponent } from './Workshop/participant-enrollment-dashboard/participant-enrollment-dashboard.component';
// import { WorkshopImageUploadComponent } from './Workshop/workshop-image-upload/workshop-image-upload.component';
// import { BigAggregateComponent } from './big/big-aggregate/big-aggregate.component';
// import { NotificationsLogComponent } from './AppEngagement/notifications-log/notifications-log.component';
// import { ChatScreenComponent } from './Events/Chat/chat-screen/chat-screen.component';
// import { JourneycoachDashboardComponent } from './Journey Onboarding/journeycoach-dashboard/journeycoach-dashboard.component';
// import { JourneyplanComponent } from './Journey Onboarding/journeyplan/journeyplan.component';
// import { JourneyProductPurchaseComponent } from './Participants Profile Management/journey-product-purchase/journey-product-purchase.component';
// import { ParticipantDeliverySequenceComponent } from './Participants Profile Management/participant-delivery-sequence/participant-delivery-sequence.component';
// import { BigActivityComponent } from './big/big-activity/big-activity.component';
// import { ZoomAccountComponent } from './queue system/zoom-account/zoom-account.component';
// import { ArenastudioactivityComponent } from './queue system/arenastudioactivity/arenastudioactivity.component';
// import { EditAtcComponent } from './ATC/edit-atc/edit-atc.component';
// import { QueueTransferComponent } from './queue system/queue-transfer/queue-transfer.component';
// import { ParticipantsEvolutionSummaryComponent } from './Participants Profile Management/participants-analytics/participants-evolution-summary/participants-evolution-summary.component';
// import { CreateArenaSpaceComponent } from './big/create-arena-space/create-arena-space.component';
// import { ConfigNewTierComponent } from './content/tier-access-config/config-new-tier/config-new-tier.component';
// import { BigActivityLogComponent } from './big/big-activity-log/big-activity-log.component';
// import { CreateWorkshopComponent } from './New-Workshop/create-workshop/create-workshop.component';
// import { WorkshopConfigurationComponent } from './New-Workshop/workshop-configuration/workshop-configuration.component';
// import { WorkshopsComponent } from './New-Workshop/workshops/workshops.component';
// import { UpdateAdjustmentTaxonomyComponent } from './AppEngagement/taxonomy/update-adjustment-taxonomy/update-adjustment-taxonomy.component';
// import { ParticipantProductComponent } from './Participants Profile Management/participant-product/participant-product.component';
// import { CategoryDashboardComponent } from './content/category-dashboard/category-dashboard.component';
// import { NewProfileComponent } from './Participants Profile Management/new-profile/new-profile.component';
// import { NotificationRecordComponent } from './AppEngagement/notification-record/notification-record.component';
// import { CommunicationComponent } from './Communication Center/communication/communication.component';
// import { JourneycoachDuplicateComponent } from './Journey Onboarding/journeycoach-duplicate/journeycoach-duplicate.component';
// import { ProductInitiationDashboardComponent } from './Journey Onboarding/product-initiation-dashboard/product-initiation-dashboard.component';
// import { DeliveryDashboardComponent } from './Journey Onboarding/delivery-dashboard/delivery-dashboard.component';
// import { OverallDashboardComponent } from './Journey Onboarding/overall-dashboard/overall-dashboard.component';
// import { CustomerticketsComponent } from './Customer Support/customertickets/customertickets.component';
// import { SalesDashboardComponent } from './Journey Onboarding/sales-dashboard/sales-dashboard.component';

// import { EmailRecordComponent } from './AppEngagement/email-record/email-record.component';
// import { CreateEmailTemplateComponent } from './Communication Center/create-email-template/create-email-template.component';
// import { ParticipantTouchpointComponent } from './participant-touchpoint/participant-touchpoint.component';
// import { ParticipantsChecklistsComponent } from './Participants Profile Management/participants-analytics/participants-checklists/participants-checklists.component';
// import { WorkshopDashboardComponent } from './New-Workshop/workshop-dashboard/workshop-dashboard.component';
// import { FormAssignmentComponent } from './New-Workshop/form-assignment/form-assignment.component';
// import { AppointmentStudioComponent } from './Scheduling/appointment-studio/appointment-studio.component';
// import { AppointmentZoomViewComponent } from './Scheduling/appointment-zoom-view/appointment-zoom-view.component';
// import { AppointmentStatusUpdateComponent } from './Scheduling/appointment-zoom-view/appointment-status-update/appointment-status-update.component';
// import { ModeDashboardNewComponent } from './AppEngagement/mode-dashboard-new/mode-dashboard-new.component';
// import { BigChatScreenComponent } from './big/big-chat-screen/big-chat-screen.component';
// import { FormBasedSubmissionComponent } from './big/form-based-submission/form-based-submission.component';
// import { AtcPreviewComponent } from './ATC/atc-preview/atc-preview.component';
// import { EvolutionMappingComponent } from './EvolutionMapping/evolution-mapping/evolution-mapping.component';
// import { ParticipantEvolutionMappingComponent } from './EvolutionMapping/evolution-mapping/participant-evolution-mapping/participant-evolution-mapping.component';
// import { PreviewTripleATCComponent } from './ATC/Triple ATC/preview-triple-atc/preview-triple-atc.component';
// import { ZoomClientviewComponent } from './queue system/zoom-clientview/zoom-clientview.component';
// import { TvAuthComponent } from './tv-auth.component';
// import { QueuePlanningComponent } from './queue system/queue-planning/queue-planning.component';
// import { AppFlowBreaksComponent } from './Participants Profile Management/app-flow-breaks/app-flow-breaks.component';
// import { ZoomRecordingDashboardComponent } from './Communication Center/zoom-recording-dashboard/zoom-recording-dashboard.component';
// import { ProductPageComponent } from './New-Workshop/product-page/product-page.component';
// import { CustomerTicketNewComponent } from './Customer Support/customer-ticket-new/customer-ticket-new.component';
// import { EvolutionWishlistFormComponent } from './AppEngagement/evolution-wishlist-form/evolution-wishlist-form.component';
// import { QueuePlanningCloneComponent } from './queue system/queue-planning-clone/queue-planning-clone.component';
// import { QueuePlanningReviewComponent } from './queue system/queue-planning-review/queue-planning-review.component';
// import { HPCComponent } from './hpc/hpc.component';
// import { DynamicQueueManagerCloneComponent } from './queue system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component';
// import { EngagementDashboardComponent } from './New-Workshop/engagement-dashboard/engagement-dashboard.component';
// import { EntryManagementComponent } from './Business Dashboard/AdsEntry/entry-management.component';
// import { ExpensePlannerComponent } from './Business Dashboard/expense-planner/expense-planner.component';


// export const routes: Routes = [
//   {path: '', redirectTo: '/EISDashboard', pathMatch:'full'},
//   {path: 'login', component: LoginComponent },
//   // {path: 'EISDashboard', component: MainDashboardComponent,canActivate:[authGuard]},
//   {path: 'routeconfiguration', component: RouteConfigurationComponent,canActivate:[authGuard]},
//   {path: 'addjourney', component: AddjourneyComponent,canActivate:[authGuard]},
//   {path: 'addpackage', component: AddpackageComponent,canActivate:[authGuard]},
//   {path: 'packagedesign', component: PackageDesignComponent, canActivate:[authGuard]},
//   {path: 'atcmodel', component: ViewAtcmodelComponent, canActivate: [authGuard]},
//   {path: 'journeyproductmap', component: JourneyProductComponent, canActivate: [authGuard]},
//   {path: 'createaelnames', component: CreateAelNamesComponent, canActivate: [authGuard]},
//   {path: 'addproduct', component: AddProductComponent,canActivate:[authGuard]},
//   {path: 'viewproductmodeplaylist', component: ViewProductModePlaylistComponent,canActivate:[authGuard]},
//   {path: 'productdelivery', component: ProductDeliveryComponent,canActivate:[authGuard]},
//   {path: 'deliverysequence', component: DeliverySequenceComponent,canActivate:[authGuard]},
//   {path: 'profilelist', component: ProfilelistComponent, canActivate:[authGuard]},
//   {path: 'app-flow-breaks', component: AppFlowBreaksComponent, canActivate:[authGuard]},
//   {path: 'participantproduct', component: ParticipantProductComponent, canActivate:[authGuard]},
//   {path: 'ProfileScreen', component:NewProfileComponent, canActivate:[authGuard]},
//   {path: 'journeysupport/:pid',component:JourneyplanComponent,canActivate:[authGuard]},
//   {path: 'participantdeliverysequence/:pid', component:ParticipantDeliverySequenceComponent, canActivate:[authGuard]},
//   {path: 'participantpurchase/:pid', component: JourneyProductPurchaseComponent, canActivate:[authGuard]},
//   {path: 'profilesummary/:profileid', component: ProfileSummaryComponent, canActivate: [authGuard]},
//   {path: 'userprofile/:id', component: UserprofileComponent, canActivate: [authGuard]},
//   {path: 'deliveryactivities',component:DeliverySetComponent,canActivate:[authGuard]},
//   {path: 'eventopportunitydashboard', component: EventOpportunityDashboardComponent, canActivate:[authGuard]},
//   {path: 'formtemplate',component:FormtemplateComponent,canActivate:[authGuard]},
//   {path: 'queuelist', component:QueueListComponent, canActivate:[authGuard]},
//   {path: 'audiodashboard',component:AudioDashboardComponent,canActivate:[authGuard]},
//   {path: 'playlistdashboard',component:PlaylistDashboardComponent,canActivate:[authGuard],children:[
//     {path: 'edit-playlist', component: EditComponent , canActivate : [authGuard]},
//     {path: 'add-playlist', component: SolarPlaylistComponent , canActivate : [authGuard]},
//   ]},

//   {path: 'playlistads',component:PlaylistAdsComponent,canActivate:[authGuard]},
//   {path: 'healthstories',component:HealthStoriesComponent,canActivate:[authGuard]},
//   {path: 'ads',component:ClickAdsComponent,canActivate:[authGuard]},
//   {path: 'queuevenue', component:QueueVenueComponent, canActivate:[authGuard]},
//   {path: 'dynamicstudio', component:DynamicStudioComponent, canActivate:[authGuard]},
//   {path: 'view-participants-form', component:ViewParticipantsFormComponent,canActivate:[authGuard]},
//   {path: 'videodashboard', component: EpisodesDashboardComponent, canActivate:[authGuard]},
//   {path: 'contentanalytics', component: ContentAnalyticsComponent, canActivate:[authGuard]},
//   {path: 'accessscreen', component: AccessScreenComponent, canActivate:[authGuard]},
//   {path: 'seriesdashboard', component: SeriesDashboardComponent, canActivate:[authGuard], children: [
//     {path:'addseries', component: AddSeriesComponent, canActivate: [authGuard]},
//     {path:'editseries', component: EditSeriesComponent, canActivate:[authGuard]},
//   ]},
//   {path: 'category-dashboard', component: CategoryDashboardComponent, canActivate:[authGuard]},
//   {path: 'zoomaccount', component: ZoomAccountComponent, canActivate:[authGuard]},
//   {path: 'arenastudioactivity', component: ArenastudioactivityComponent, canActivate:[authGuard]},
//   {path: 'queuetransfer', component: QueueTransferComponent, canActivate:[authGuard]},
//   {path: 'viewparticipantstieraccess', component: ViewparticipantTierAccessComponent, canActivate:[authGuard]},
//   {path: 'tieraccessconfig', component:ViewTierAccessComponent, canActivate: [authGuard]},
//   {path: 'event_participation_approve', component:EventParticipationApproveComponent, canActivate: [authGuard]},
//   {path: 'create_event', component:EventListComponent, canActivate: [authGuard]},
//   {path: 'arena_e_ticket_approve', component:ArenaETicketApproveComponent, canActivate: [authGuard]},
//   {path: 'qr-scanner', component:QrScannerComponent, canActivate: [authGuard]},
//   {path: 'event_attendance_log', component:EventAttendanceLogComponent, canActivate: [authGuard]},
//   {path: 'videoask-display',component:VideoaskDisplayComponent,canActivate:[authGuard]},
//   {path: 'live_event_dashboard',component:LiveEventDashboardComponent,canActivate:[authGuard]},
//   {path: 'contentupload', component:ContentUploadComponent, canActivate: [authGuard]},
//   {path: 'createarenavideoasktemplate', component:ArenaVideoAskInputComponent, canActivate: [authGuard]},

//   // Scheduling
//   {path: 'EISzoom', component: EISZoomAccountComponent, canActivate:[authGuard]},
//   {path: 'appointmentavailability', component: AppointmentAvailabilityComponent, canActivate:[authGuard]},
//   {path: 'bookappointment', component: BookAppointmentComponent, canActivate:[authGuard]},
//   {path: 'appointmentcalendar', component: AppointmentCalendarComponent, canActivate:[authGuard]},
//   {path: 'mycalendar', component: AppointmentCalendarComponent, canActivate:[authGuard]},
//   {path: 'roster', component: RoasterComponent, canActivate:[authGuard]},
//   {path: 'appointmentstatuspending', component: AppointmentStatusPendingComponent, canActivate:[authGuard]},
//   {path: 'appointmentrole', component: AppointmentRolesComponent, canActivate:[authGuard]},
//   {path: 'eisappointmentrole', component: EisAppointmentRoleComponent, canActivate:[authGuard]},
//   {path: 'mapappointmentrole', component: MapAppointmentRoleComponent, canActivate:[authGuard]},
//   {path: 'mapclienteis', component: MapClientEisComponent, canActivate:[authGuard]},
//   {path: 'teamdeliveryhours', component: TeamDeliveryHoursComponent, canActivate:[authGuard]},
//   {path: 'offtime', component: OfftimeListComponent, canActivate:[authGuard]},
//   {path: 'approveofftime', component: ApproveOfftimeComponent, canActivate:[authGuard]},
//   {path: 'capacityutilization', component: CapacityUtilizationComponent, canActivate:[authGuard]},
//   {path: 'appointmentstudio', component: AppointmentStudioComponent, canActivate:[authGuard]},
//   {path: 'openappointmentzoom/:id', component: AppointmentZoomViewComponent, canActivate:[authGuard]},
//   {path: 'appointment-status-update', component: AppointmentStatusUpdateComponent, canActivate:[authGuard]},


//   {path: 'appactionpending', component: AppActionPendingComponent, canActivate: [authGuard]},
//   {path: 'interimreportlog', component: InterimReportLogComponent, canActivate: [authGuard]},
//   {path: 'evolutionwishlistlog', component: EvolutionWishlistLogScreenComponent, canActivate: [authGuard]},
//   {path: 'evolutionwishlist', component: EvolutionWishlistFormComponent},
//   {path: 'modedashboard', component: ModeDashboardComponent, canActivate: [authGuard]},
//   {path: 'mode-dashboard-new', component: ModeDashboardNewComponent, canActivate: [authGuard]},
//   {path: 'participantAEL/:id', component:ParticipantAELComponent, canActivate: [authGuard]},
//   {path: 'participantAEL', component:ParticipantAELComponent, canActivate: [authGuard]},
//   {path: 'productmodeconfig', component: ProductModeConfigComponent, canActivate: [authGuard]},
//   {path: 'communitymanager',component: CommunityManagerComponent,canActivate:[authGuard]},
//   {path: 'recommendedplaylist', component: ManageRecommendedPlaylistComponent, canActivate: [authGuard]},
//   {path: 'bigwall', component:BigwallDataAddingComponent, canActivate: [authGuard]},
//   {path: 'atctaxonomy', component:ViewTagsComponent, canActivate: [authGuard]},
//   {path: 'layers-screen', component: LayersScreenComponent, canActivate: [authGuard]},
//   {path: 'viewUpgradedATC', component:ViewUpgradedAtcComponent, canActivate: [authGuard]},
//   {path: 'atctrajectory',component: EitEducationAtcComponent,canActivate:[authGuard]},
//   {path: 'createworkshop', component:ViewWorkshopComponent, canActivate: [authGuard]},

//   {path: 'initiateeventproduct', component:InitiateEventProductComponent, canActivate: [authGuard]},
//   {path: 'queuelist', component: QueueListComponent, canActivate: [authGuard]},
//   {path: 'queue-planner', component: QueuePlanningComponent, canActivate: [authGuard]},
//   {path: 'queue-planner-review', component: QueuePlanningReviewComponent, canActivate: [authGuard]},
//   {path: 'queuebigplanner', component: BigPlannerComponent, canActivate: [authGuard]},
//   {path: 'dynamicqueuemanager', component: DynamicQueueManagerComponent, canActivate: [authGuard]},
//   {path: 'dynamicqueuemanager-v2', component: DynamicQueueManagerCloneComponent, canActivate: [authGuard]},
//   {path: 'openmeeting/:id', component: ZoomClientviewComponent, canActivate:[authGuard]},


//   {path: 'prescribeATC', component: PrescribeATCComponent, canActivate: [authGuard]},
//   {path: 'editATC/:atc/:type', component: EditAtcComponent, canActivate: [authGuard],},
//   {path: 'previewATC', component: AtcPreviewComponent, canActivate: [authGuard],},
//   {path: 'viewprescribedATC', component: ViewPrescribedATCComponent, canActivate: [authGuard]},
//   {path: 'viewassignedATC', component: ViewAssignedATCComponent, canActivate: [authGuard]},
//   {path: 'reviewflagATC', component:ReviewFlagATCComponent, canActivate: [authGuard]},
//   {path: 'pickformentoring', component: PickForMentoringComponent, canActivate:[authGuard]},

//   {path: 'addtripleATC',component: AddTripleATCComponent,canActivate:[authGuard]},
//   {path: 'viewtripleATC',component: ViewTripleATCComponent,canActivate:[authGuard]},
//   {path: 'previewtripleATC',component: PreviewTripleATCComponent,canActivate:[authGuard]},
//   {path: 'edittripleATC/:atc',component: EditTripleATCComponent,canActivate:[authGuard]},

//   {path: 'workshopchallengecreation', component:ChallengeViewComponent, canActivate: [authGuard]},
//   {path: 'customersupportdashboard', component: CustomerSupportDashboardComponent, canActivate: [authGuard]},
//   {path: 'customer-support-tickets', component: CustomerTicketNewComponent, canActivate: [authGuard]},
//   {path: 'salesleads',component:SalesleadComponent,canActivate:[authGuard]},
//   {path: 'onboardingremarks', component: OnboardingRemarkComponent, canActivate: [authGuard]},
//   {path: 'opportunities', component: JourneycoachOpportunitiesComponent, canActivate: [authGuard]},
//   {path: 'participants-analytics', component: ParticipantsAnalyticsComponent, canActivate: [authGuard]},
//   {path: 'enrollment_config_view',component:EnrollmentConfigViewComponent,canActivate:[authGuard]},
//   {path: 'workshopchallengeparticipantdashboard',component:ParticipantEnrollmentDashboardComponent,canActivate:[authGuard]},
//   {path: 'workshop_image_upload',component:WorkshopImageUploadComponent,canActivate:[authGuard]},
//   {path: 'big-dashboard',component: BigDashboardComponent, canActivate:[authGuard]},
//   {path: 'bigchatscreen',component: BigChatScreenComponent, canActivate:[authGuard]},
//   {path: 'formbasedsubmission',component: FormBasedSubmissionComponent, canActivate:[authGuard]},
//   {path: 'bigProfile',component: BigProfileComponent, canActivate:[authGuard]},
//   {path: 'particiant_assignment_board', component: ParticipantAssignmentBoardComponent, canActivate: [authGuard]},
//   {path: 'zoommeeting_bigparticipants', component: ZoomMeetingComponent, canActivate: [authGuard]},
//   {path: 'bigcohorts', component: BigCohortsComponent, canActivate: [authGuard]},
//   {path: 'manualassignment', component:ManualAssignmentsComponent, canActivate: [authGuard]},
//   {path: 'validateParticipantAssignments', component:ValidateParticipantsAssignmentComponent, canActivate: [authGuard]},
//   {path: 'biglevel', component: BigLevelComponent, canActivate : [authGuard]},
//   {path: 'modellevelconfig', component: AtcmodelLevelConfigComponent, canActivate : [authGuard]},
//   {path: 'bigaggregateeventlevel', component: BigAggregateEventLevelComponent, canActivate: [authGuard]},
//   {path: 'bigactivitymonitor', component:MonitorActivityLogComponent, canActivate: [authGuard]},
//   {path: 'createworkshop',component:ViewWorkshopComponent,canActivate:[authGuard]},
//   {path: 'big_aggregate',component:BigAggregateComponent,canActivate:[authGuard]},
//   {path: 'notificationlog',component:NotificationsLogComponent,canActivate:[authGuard]},
//   {path: 'notificationrecord',component:NotificationRecordComponent,canActivate:[authGuard]},
//   {path: 'JourneycoachDashboard-new',component:  JourneycoachDuplicateComponent,canActivate:[authGuard]},
//   {path: 'productinitiated-dashboard',component:  ProductInitiationDashboardComponent,canActivate:[authGuard]},
//   {path: 'delivery-dashboard',component:  DeliveryDashboardComponent,canActivate:[authGuard]},
//   {path: 'overall-dashboard',component:  OverallDashboardComponent,canActivate:[authGuard]},
//   {path: 'customertickets',component:  CustomerticketsComponent,canActivate:[authGuard]},
//   {path: 'sales-report',component:  SalesDashboardComponent,canActivate:[authGuard]},
//   {path: 'zoom-recording-dashboard',component: ZoomRecordingDashboardComponent,canActivate:[authGuard]},

//   {path: 'group-chat',component:ChatScreenComponent,canActivate:[authGuard]},
//   {path: 'bigactivity',component:BigActivityComponent,canActivate:[authGuard]},
//   {path: 'bigactivity', component: BigActivityComponent, canActivate:[authGuard]},
//   {path: 'participant-evolution-summary', component: ParticipantsEvolutionSummaryComponent, canActivate:[authGuard]},
//   {path: 'arena_space', component: CreateArenaSpaceComponent, canActivate:[authGuard]},
//   {path: 'bigactivitylog', component: BigActivityLogComponent, canActivate:[authGuard]},
//   {path: 'create-workshop',component:CreateWorkshopComponent},
//   {path: 'workshopconfig/:id', component: WorkshopConfigurationComponent},
//   {path: 'workshops', component: WorkshopsComponent},
//   {path: 'updateprofiletaxonomy', component:UpdateAdjustmentTaxonomyComponent, canActivate:[authGuard]},
//   {path: 'email-templates', component:CreateEmailTemplateComponent, canActivate:[authGuard]},
//   {path: 'communication', component:CommunicationComponent, canActivate:[authGuard]},
//   {path: 'participanttouchpoint', component:ParticipantTouchpointComponent, canActivate:[authGuard]},
//   {path: 'workshop_dashboard',component:WorkshopDashboardComponent,canActivate:[authGuard]},
//   {path: 'formtemplateworkshop',component:FormAssignmentComponent,canActivate:[authGuard]},
//   {path: 'evolutionmapping',component:EvolutionMappingComponent,canActivate:[authGuard]},
//   {path: 'participantevolution',component:ParticipantEvolutionMappingComponent,canActivate:[authGuard]},
//   {path: 'productpageworkshop',component:ProductPageComponent,},
//   {path: 'tv-auth', component: TvAuthComponent},
//   {path: 'engagementdashboard', component: EngagementDashboardComponent},
//   {path: 'hpc', component: HPCComponent,canActivate:[authGuard]},
//   {path: 'ads-entry', component: EntryManagementComponent, canActivate: [authGuard]},
//   {path: 'expense-planner', component: ExpensePlannerComponent, canActivate: [authGuard]},
// ];
